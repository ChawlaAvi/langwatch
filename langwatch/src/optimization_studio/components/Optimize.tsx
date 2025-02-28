import {
  Alert,
  AlertIcon,
  Box,
  Button,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Skeleton,
  Spacer,
  Text,
  Tooltip,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";

import type { Node } from "@xyflow/react";
import { chakraComponents, Select as MultiSelect } from "chakra-react-select";
import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Info, TrendingUp } from "react-feather";
import {
  Controller,
  useForm,
  type UseControllerProps,
  type UseFormReturn,
} from "react-hook-form";
import { SmallLabel } from "../../components/SmallLabel";
import { useOrganizationTeamProject } from "../../hooks/useOrganizationTeamProject";
import { api } from "../../utils/api";
import { useGetDatasetData } from "../hooks/useGetDatasetData";
import { useModelProviderKeys } from "../hooks/useModelProviderKeys";
import { useOptimizationExecution } from "../hooks/useOptimizationExecution";
import { useWorkflowStore } from "../hooks/useWorkflowStore";
import type { Entry } from "../types/dsl";
import { OPTIMIZERS } from "../types/optimizers";
import { trainTestSplit } from "../utils/datasetUtils";
import { AddModelProviderKey } from "./AddModelProviderKey";
import { useVersionState, VersionToBeUsed } from "./History";
import { LLMConfigField } from "./properties/modals/LLMConfigModal";
import { checkIsEvaluator } from "../utils/nodeUtils";
import { trackEvent } from "../../utils/tracking";

const optimizerOptions: {
  label: string;
  value: keyof typeof OPTIMIZERS;
  description: string;
}[] = Object.entries(OPTIMIZERS).map(([key, optimizer]) => ({
  label: optimizer.name,
  value: key as keyof typeof OPTIMIZERS,
  description: optimizer.description,
}));

export function Optimize() {
  const { isOpen, onToggle, onClose } = useDisclosure();

  const { project } = useOrganizationTeamProject();
  const { optimizationState } = useWorkflowStore(({ state }) => ({
    optimizationState: state.optimization,
  }));

  const isRunning = optimizationState?.status === "running";

  const form = useForm<OptimizeForm>({
    defaultValues: {
      version: "",
      commitMessage: "",
      optimizer: optimizerOptions[0]!,
      params: {},
    },
  });

  return (
    <>
      <Tooltip label={isRunning ? "Optimization is running" : ""}>
        <Button
          colorPalette="green"
          size="sm"
          onClick={() => {
            trackEvent("optimize_click", { project_id: project?.id });
            onToggle();
          }}
          leftIcon={<TrendingUp size={16} />}
          isDisabled={isRunning}
        >
          Optimize
        </Button>
      </Tooltip>
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        {isOpen && <OptimizeModalContent form={form} onClose={onClose} />}
      </Modal>
    </>
  );
}

type OptimizeForm = {
  version: string;
  commitMessage: string;
  optimizer: (typeof optimizerOptions)[number];
  params: (typeof OPTIMIZERS)[keyof typeof OPTIMIZERS]["params"];
};

export function OptimizeModalContent({
  form,
  onClose,
}: {
  form: UseFormReturn<OptimizeForm>;
  onClose: () => void;
}) {
  const { project } = useOrganizationTeamProject();
  const {
    workflowId,
    getWorkflow,
    nodes,
    optimizationState,
    deselectAllNodes,
    setOpenResultsPanelRequest,
    default_llm,
  } = useWorkflowStore(
    ({
      workflow_id: workflowId,
      getWorkflow,
      nodes,
      state,
      deselectAllNodes,
      setOpenResultsPanelRequest,
      default_llm,
    }) => ({
      workflowId,
      getWorkflow,
      nodes,
      optimizationState: state.optimization,
      deselectAllNodes,
      setOpenResultsPanelRequest,
      default_llm,
    })
  );

  const entryNode = getWorkflow().nodes.find(
    (node) => node.type === "entry"
  ) as Node<Entry> | undefined;

  const { total } = useGetDatasetData({
    dataset: entryNode?.data.dataset,
    preview: true,
  });

  const optimizer = OPTIMIZERS[form.watch("optimizer").value];
  const params = form.watch("params");

  useEffect(() => {
    if (!optimizer) return;
    form.setValue(
      "params",
      Object.entries({ ...optimizer.params, ...params }).reduce(
        (acc, [key, value]) => {
          // @ts-ignore
          acc[key] = value ? value : optimizer.params[key];
          return acc;
        },
        {} as OptimizeForm["params"]
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, optimizer]);

  const trainSize = entryNode?.data.train_size ?? 0.8;
  const testSize = entryNode?.data.test_size ?? 0.2;

  const { train } = trainTestSplit(
    Array.from({ length: total ?? 0 }, (_, i) => i),
    {
      trainSize,
      testSize,
    }
  );

  const { versions, canSaveNewVersion, nextVersion, versionToBeEvaluated } =
    useVersionState({
      project,
      form: form as unknown as UseFormReturn<{
        version: string;
        commitMessage: string;
      }>,
      allowSaveIfAutoSaveIsCurrentButNotLatest: false,
    });

  const toast = useToast();
  const commitVersion = api.workflow.commitVersion.useMutation();
  const { startOptimizationExecution } = useOptimizationExecution();

  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (hasStarted && optimizationState?.status === "running") {
      onClose();
      deselectAllNodes();
      setOpenResultsPanelRequest("optimizations");
    }
  }, [
    optimizationState?.status,
    hasStarted,
    onClose,
    deselectAllNodes,
    setOpenResultsPanelRequest,
  ]);

  const onSubmit = useCallback(
    async ({ version, commitMessage, optimizer, params }: OptimizeForm) => {
      if (!project || !workflowId) return;

      let versionId: string | undefined = versionToBeEvaluated.id;

      if (!train.length) {
        return;
      }

      if (
        train.length >= 300 &&
        !confirm(`Going to optimize on ${train.length} entries. Are you sure?`)
      ) {
        return;
      }

      if (train.length >= 3000) {
        alert(
          "Optimiziation is limited to a maximum of 3000 entries total. Please contact support if you need to optimize on more."
        );
        return;
      }

      if (canSaveNewVersion) {
        try {
          const versionResponse = await commitVersion.mutateAsync({
            projectId: project.id,
            workflowId,
            commitMessage,
            dsl: {
              ...getWorkflow(),
              version,
            },
          });
          versionId = versionResponse.id;
        } catch (error) {
          toast({
            title: "Error saving version",
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "top-right",
          });
          throw error;
        }
      }

      if (!versionId) {
        toast({
          title: "Version ID not found for optimization",
          status: "error",
          duration: 5000,
          isClosable: true,
          position: "top-right",
        });
        return;
      }

      void versions.refetch();

      startOptimizationExecution({
        workflow_version_id: versionId,
        optimizer: optimizer.value,
        params,
      });
      setHasStarted(true);
    },
    [
      canSaveNewVersion,
      commitVersion,
      getWorkflow,
      project,
      startOptimizationExecution,
      toast,
      train.length,
      versionToBeEvaluated.id,
      versions,
      workflowId,
    ]
  );

  const { hasProvidersWithoutCustomKeys, nodeProvidersWithoutCustomKeys } =
    useModelProviderKeys(
      "llm" in optimizer.params && "llm" in params
        ? [params.llm ?? default_llm]
        : undefined
    );

  const isRunning = optimizationState?.status === "running";

  if (isRunning) {
    return null;
  }

  if (!versions.data) {
    return (
      <ModalContent borderTop="5px solid" borderColor="green.400">
        <ModalHeader fontWeight={600}>Optimize Workflow</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="start" width="full">
            <Skeleton width="full" height="20px" />
            <Skeleton width="full" height="20px" />
          </VStack>
        </ModalBody>
        <ModalFooter />
      </ModalContent>
    );
  }

  const hasEvaluator = nodes.some(checkIsEvaluator);
  const isDisabled =
    train.length < 20
      ? "You need at least 20 entries to run the automated optimizer"
      : hasProvidersWithoutCustomKeys
      ? "Set up your API keys to run optimizations"
      : !hasEvaluator
      ? "You need at least one evaluator node in your workflow to run optimizations"
      : false;

  const llmConfig = form.watch("params.llm");

  return (
    <ModalContent
      as="form"
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      onSubmit={form.handleSubmit(onSubmit)}
      borderTop="5px solid"
      borderColor="green.400"
    >
      <ModalHeader fontWeight={600}>Optimize Workflow</ModalHeader>
      <ModalCloseButton />
      <ModalBody display="flex" flexDirection="column" gap={4}>
        <VStack align="start" width="full" gap={4}>
          <VStack align="start" width="full">
            <VersionToBeUsed
              form={
                form as unknown as UseFormReturn<{
                  version: string;
                  commitMessage: string;
                }>
              }
              nextVersion={nextVersion}
              canSaveNewVersion={canSaveNewVersion}
              versionToBeEvaluated={versionToBeEvaluated}
            />
          </VStack>
          <VStack align="start" width="full" gap={2}>
            <SmallLabel color="gray.600">Optimizer</SmallLabel>
            <Controller
              control={form.control}
              name="optimizer"
              rules={{ required: "Optimizer is required" }}
              render={({ field }) => <OptimizerSelect field={field} />}
            />
          </VStack>
        </VStack>
        <HStack width="full">
          {"llm" in optimizer.params && (
            <VStack align="start" width="full" gap={2}>
              <HStack>
                <SmallLabel color="gray.600">Teacher LLM</SmallLabel>
                <Tooltip label="The LLM that will be used to generate the prompts and/or demonstrations. You can, for example, use a more powerful LLM to teach a smaller one.">
                  <Info size={16} />
                </Tooltip>
              </HStack>
              <Controller
                control={form.control}
                name="params.llm"
                render={({ field }) => (
                  <Box
                    width="full"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius={6}
                    paddingX={1}
                    paddingY="3px"
                  >
                    <LLMConfigField
                      allowDefault={true}
                      defaultLLMConfig={default_llm}
                      llmConfig={llmConfig ?? undefined}
                      onChange={(llmConfig) => {
                        field.onChange(llmConfig);
                      }}
                    />
                  </Box>
                )}
              />
            </VStack>
          )}
          {"num_candidates" in optimizer.params && (
            <VStack align="start" width="full" gap={2}>
              <HStack>
                <SmallLabel color="gray.600">
                  Number of Candidate Prompts
                </SmallLabel>
                <Tooltip label="Each candidate and demonstrations combination will be evaluated against the optimization set.">
                  <Info size={16} />
                </Tooltip>
              </HStack>
              <Input
                {...form.register("params.num_candidates")}
                type="number"
                min={1}
                max={100}
              />
            </VStack>
          )}
        </HStack>
        <HStack width="full">
          {"max_bootstrapped_demos" in optimizer.params && (
            <VStack align="start" width="full" gap={2}>
              <HStack>
                <SmallLabel color="gray.600">Max Bootstrapped Demos</SmallLabel>
                <Tooltip label="Maximum number of few shot demonstrations generated on the fly by the optimizer">
                  <Info size={16} />
                </Tooltip>
              </HStack>
              <Input
                {...form.register("params.max_bootstrapped_demos")}
                type="number"
                min={1}
                max={100}
              />
            </VStack>
          )}
          {"max_labeled_demos" in optimizer.params && (
            <VStack align="start" width="full" gap={2}>
              <HStack>
                <SmallLabel color="gray.600">Max Labeled Demos</SmallLabel>
                <Tooltip label="Maximum number of few shot demonstrations coming from the original dataset. Caveat: the output field of the LLM node must have exactly the same name as the dataset column.">
                  <Info size={16} />
                </Tooltip>
              </HStack>
              <Input
                {...form.register("params.max_labeled_demos")}
                type="number"
                min={1}
                max={100}
              />
            </VStack>
          )}
        </HStack>
        {/* {"max_rounds" in optimizer.params && (
          <VStack align="start" width="full" gap={2}>
            <SmallLabel color="gray.600">Max Rounds</SmallLabel>
            <Input
              {...form.register("params.max_rounds")}
              type="number"
              min={1}
              max={100}
            />
          </VStack>
        )} */}
      </ModalBody>
      <ModalFooter borderTop="1px solid" borderColor="gray.200" marginTop={4}>
        <VStack align="start" width="full" gap={3}>
          {hasProvidersWithoutCustomKeys ? (
            <AddModelProviderKey
              runWhat="run optimizations"
              nodeProvidersWithoutCustomKeys={nodeProvidersWithoutCustomKeys}
            />
          ) : !hasEvaluator ? (
            <Alert status="warning">
              <AlertIcon />
              <Text>
                You need at least one evaluator node in your workflow to be able
                to run optimizations
              </Text>
            </Alert>
          ) : null}
          <HStack width="full">
            <VStack align="start" gap={0}>
              <Text fontWeight={500}>
                {train.length} optimization set entries
              </Text>
            </VStack>
            <Spacer />
            <Tooltip label={isDisabled}>
              <Button
                variant="outline"
                type="submit"
                leftIcon={<CheckSquare size={16} />}
                isLoading={
                  commitVersion.isLoading ||
                  optimizationState?.status === "waiting"
                }
                isDisabled={!!isDisabled}
              >
                {canSaveNewVersion
                  ? "Save & Run Optimization"
                  : "Run Optimization"}
              </Button>
            </Tooltip>
          </HStack>
        </VStack>
      </ModalFooter>
    </ModalContent>
  );
}

const OptimizerSelect = ({
  field,
}: {
  field: UseControllerProps<OptimizeForm>;
}) => {
  return (
    // @ts-ignore
    <MultiSelect
      {...field}
      options={optimizerOptions}
      hideSelectedOptions={false}
      isSearchable={false}
      useBasicStyles
      chakraStyles={{
        container: (base) => ({
          ...base,
          background: "white",
          width: "100%",
          borderRadius: "5px",
        }),
      }}
      components={{
        Menu: ({ children, ...props }) => (
          <chakraComponents.Menu
            {...props}
            innerProps={{
              ...props.innerProps,
            }}
          >
            {children}
          </chakraComponents.Menu>
        ),
        Option: ({ children, ...props }) => (
          <chakraComponents.Option {...props}>
            <VStack align="start">
              <Text>{children}</Text>
              <Text
                color={props.isSelected ? "white" : "gray.500"}
                fontSize={13}
              >
                {(props.data as any).description}
              </Text>
            </VStack>
          </chakraComponents.Option>
        ),
      }}
    />
  );
};
