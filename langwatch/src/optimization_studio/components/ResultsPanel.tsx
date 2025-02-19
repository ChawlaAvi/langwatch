import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Heading,
  HStack,
  Skeleton,
  Spacer,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import type { Experiment, Project } from "@prisma/client";
import type { Node } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "react-feather";
import {
  BatchEvaluationV2RunList,
  useBatchEvaluationState,
} from "../../components/experiments/BatchEvaluationV2";
import { BatchEvaluationV2EvaluationResults } from "../../components/experiments/BatchEvaluationV2/BatchEvaluationV2EvaluationResults";
import { BatchEvaluationV2EvaluationSummary } from "../../components/experiments/BatchEvaluationV2/BatchEvaluationSummary";
import { EvaluationProgressBar } from "../../components/experiments/BatchEvaluationV2/EvaluationProgressBar";
import {
  DSPyExperimentRunList,
  DSPyExperimentSummary,
  DSPyRunsScoresChart,
  RunDetails,
  useDSPyExperimentState,
} from "../../components/experiments/DSPyExperiment";
import { useOrganizationTeamProject } from "../../hooks/useOrganizationTeamProject";
import type { AppliedOptimization } from "../../server/experiments/types";
import { experimentSlugify } from "../../server/experiments/utils";
import { api } from "../../utils/api";
import { useEvaluationExecution } from "../hooks/useEvaluationExecution";
import { useOptimizationExecution } from "../hooks/useOptimizationExecution";
import { useWorkflowStore } from "../hooks/useWorkflowStore";
import type { Field, Signature } from "../types/dsl";
import { simpleRecordListToNodeDataset } from "../utils/datasetUtils";
import { OptimizationProgressBar } from "./ProgressToast";

export function ResultsPanel({
  isCollapsed,
  collapsePanel,
  defaultTab,
}: {
  isCollapsed: boolean;
  collapsePanel: (isCollapsed: boolean) => void;
  defaultTab: "evaluations" | "optimizations";
}) {
  const [tabIndex, setTabIndex] = useState(
    defaultTab === "evaluations" ? 0 : 1
  );

  useEffect(() => {
    setTabIndex(defaultTab === "evaluations" ? 0 : 1);
  }, [defaultTab]);

  return (
    <HStack
      display={isCollapsed ? "none" : undefined}
      background="white"
      borderTop="2px solid"
      borderColor="gray.200"
      width="full"
      fontSize="14px"
      height="full"
      align="start"
      position="relative"
    >
      <Button
        variant="ghost"
        onClick={() => collapsePanel(true)}
        position="absolute"
        top={1}
        right={1}
        size="xs"
        zIndex={1}
      >
        <X size={16} />
      </Button>
      <Tabs
        width="full"
        height="full"
        display="flex"
        flexDirection="column"
        size="sm"
        index={tabIndex}
        onChange={(index) => setTabIndex(index)}
      >
        <TabList>
          <Tab>Evaluations</Tab>
          <Tab>Optimizations</Tab>
        </TabList>
        <TabPanels minHeight="0" height="full">
          <TabPanel padding={0} height="full">
            {!isCollapsed && tabIndex === 0 && <EvaluationResults />}
          </TabPanel>
          <TabPanel padding={0} height="full">
            {!isCollapsed && tabIndex === 1 && <OptimizationResults />}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </HStack>
  );
}

export function EvaluationResults() {
  const { workflowId, evaluationState } = useWorkflowStore(
    ({ workflow_id: workflowId, state }) => ({
      workflowId,
      evaluationState: state.evaluation,
    })
  );

  const { project } = useOrganizationTeamProject();

  const [keepFetching, setKeepFetching] = useState(false);

  const experiment = api.experiments.getExperimentBySlug.useQuery(
    {
      projectId: project?.id ?? "",
      experimentSlug: experimentSlugify(workflowId ?? ""),
    },
    {
      enabled: !!project && !!workflowId,
      refetchOnWindowFocus: false,
      refetchInterval: keepFetching ? 1 : undefined,
    }
  );

  useEffect(() => {
    if (evaluationState?.status === "running" && !experiment.data) {
      setKeepFetching(true);
    } else {
      setTimeout(
        () => {
          setKeepFetching(false);
        },
        experiment.data ? 0 : 15_000
      );
    }
  }, [evaluationState?.status, experiment.data]);

  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(
    evaluationState?.run_id
  );

  const { stopEvaluationExecution } = useEvaluationExecution();

  const {
    selectedRun,
    isFinished,
    batchEvaluationRuns,
    selectedRunId: selectedRunId_,
  } = useBatchEvaluationState({
    project: project,
    experiment: experiment.data,
    selectedRunId,
    setSelectedRunId,
  });

  if (experiment.isError && experiment.error.data?.httpStatus === 404) {
    if (keepFetching) {
      return <Text padding={4}>Loading...</Text>;
    }
    return <Text padding={4}>No evaluations started yet</Text>;
  }

  if (experiment.isError) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error loading evaluation results
      </Alert>
    );
  }

  if (!experiment.data || !project) {
    return <Text padding={4}>Loading...</Text>;
  }

  const evaluationStateRunId = evaluationState?.run_id;

  return (
    <HStack align="start" width="full" height="full" spacing={0}>
      <BatchEvaluationV2RunList
        batchEvaluationRuns={batchEvaluationRuns}
        selectedRun={selectedRun}
        selectedRunId={selectedRunId_}
        setSelectedRunId={setSelectedRunId}
        size="sm"
      />
      <VStack spacing={0} width="full" height="full" minWidth="0">
        <BatchEvaluationV2EvaluationResults
          project={project}
          experiment={experiment.data}
          runId={selectedRunId_}
          isFinished={isFinished}
          size="sm"
        />
        <Spacer />
        {selectedRun && (
          <BatchEvaluationV2EvaluationSummary run={selectedRun} />
        )}
        {(!selectedRun || selectedRun.run_id === evaluationStateRunId) &&
          evaluationStateRunId &&
          evaluationState?.status === "running" && (
            <HStack
              width="full"
              padding={3}
              borderTop="1px solid"
              borderColor="gray.200"
              spacing={2}
            >
              <Text whiteSpace="nowrap" marginTop="-1px" paddingX={2}>
                Running
              </Text>
              <EvaluationProgressBar
                evaluationState={evaluationState}
                size="lg"
              />
              <Button
                colorScheme="red"
                onClick={() =>
                  stopEvaluationExecution({
                    run_id: evaluationStateRunId,
                  })
                }
                minHeight="28px"
                minWidth="0"
                paddingY="6px"
                marginLeft="8px"
              >
                <Box paddingX="6px">Stop</Box>
              </Button>
            </HStack>
          )}
      </VStack>
    </HStack>
  );
}

export function OptimizationResults() {
  const { workflowId, optimizationState } = useWorkflowStore(
    ({ workflow_id: workflowId, state }) => ({
      workflowId,
      optimizationState: state.optimization,
    })
  );

  const { project } = useOrganizationTeamProject();

  const [keepFetching, setKeepFetching] = useState(false);

  const experiment = api.experiments.getExperimentBySlug.useQuery(
    {
      projectId: project?.id ?? "",
      experimentSlug: experimentSlugify(`${workflowId ?? ""}-optimizations`),
    },
    {
      enabled: !!project && !!workflowId,
      refetchOnWindowFocus: false,
      refetchInterval: keepFetching ? 1 : undefined,
    }
  );

  useEffect(() => {
    if (optimizationState?.status === "running" && !experiment.data) {
      setKeepFetching(true);
    } else {
      setTimeout(
        () => {
          setKeepFetching(false);
        },
        experiment.data ? 0 : 15_000
      );
    }
  }, [optimizationState?.status, experiment.data]);

  if (experiment.isError && experiment.error.data?.httpStatus === 404) {
    if (keepFetching) {
      return <Text padding={4}>Loading...</Text>;
    }
    return <Text padding={4}>No optimizations started yet</Text>;
  }

  if (experiment.isError) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error loading optimization results
      </Alert>
    );
  }

  if (!experiment.data || !project) {
    return <Text padding={4}>Loading...</Text>;
  }

  return (
    <LoadedOptimizationResults experiment={experiment.data} project={project} />
  );
}

export function LoadedOptimizationResults({
  experiment,
  project,
}: {
  experiment: Experiment;
  project: Project;
}) {
  const { optimizationState, nodes, setNodes, setOpenResultsPanelRequest } =
    useWorkflowStore(
      ({ state, nodes, setNodes, setOpenResultsPanelRequest }) => ({
        optimizationState: state.optimization,
        nodes,
        setNodes,
        setOpenResultsPanelRequest,
      })
    );

  const incomingRunIds =
    optimizationState?.run_id &&
    ["waiting", "running"].includes(optimizationState.status ?? "")
      ? [optimizationState.run_id]
      : [];
  const [selectedRuns, setSelectedRuns] = useState<string[]>(incomingRunIds);

  useEffect(() => {
    if (
      selectedRuns.includes(optimizationState?.run_id ?? "") &&
      optimizationState?.status === "error"
    ) {
      setSelectedRuns([]);
    }
  }, [optimizationState?.run_id, optimizationState?.status, selectedRuns]);

  const {
    dspyRuns,
    selectedRuns: selectedRuns_,
    setSelectedRuns: setSelectedRuns_,
    highlightedRun,
    setHighlightedRun,
    selectedPoint,
    setSelectedPoint,
    dspyRunsPlusIncoming,
    stepToDisplay,
    labelNames,
    runsById,
    optimizerNames,
  } = useDSPyExperimentState({
    project,
    experiment,
    selectedRuns,
    setSelectedRuns,
    incomingRunIds,
  });

  const { stopOptimizationExecution } = useOptimizationExecution();

  const optimizationStateRunId = optimizationState?.run_id;

  const toast = useToast();

  const onApplyOptimizations = (
    appliedOptimizations: AppliedOptimization[]
  ) => {
    const appliedOptimizationsMap = Object.fromEntries(
      appliedOptimizations.map((optimization) => [
        optimization.id,
        optimization,
      ])
    );
    const matchingNodes = nodes.filter(
      (node) => appliedOptimizationsMap[node.id]
    );

    setNodes(
      nodes.map((node) => {
        const optimization = appliedOptimizationsMap[node.id];
        if (node.type === "signature" && optimization) {
          const node_ = {
            ...node,
            // deep clone the node data
            data: JSON.parse(JSON.stringify(node.data)),
          } as Node<Signature>;

          const setNodeParameter = (
            identifier: string,
            field: Omit<Field, "value"> & { value?: any }
          ) => {
            const existingParameter = node_.data.parameters?.find(
              (p) => p.identifier === identifier
            );
            if (existingParameter) {
              node_.data.parameters = node_.data.parameters?.map((p) =>
                p.identifier === identifier ? { ...p, ...field } : p
              );
            } else {
              node_.data.parameters = [...(node_.data.parameters ?? []), field];
            }
          };

          if (optimization.demonstrations) {
            const demonstrations = simpleRecordListToNodeDataset(
              Object.values(optimization.demonstrations).map((demonstration) =>
                Object.fromEntries(
                  Object.entries(demonstration).filter(
                    ([key]) => key !== "augmented"
                  )
                )
              )
            );
            setNodeParameter("demonstrations", {
              identifier: "demonstrations",
              type: "dataset",
              value: demonstrations,
            });
          }
          if (optimization.instructions) {
            setNodeParameter("instructions", {
              identifier: "instructions",
              type: "str",
              value: optimization.instructions,
            });
          }
          const optimizedFieldsByIdentifier = Object.fromEntries(
            optimization.fields?.map((field) => [field.identifier, field]) ?? []
          );
          node_.data.inputs = node_.data.inputs?.map((input) => {
            const optimizedField =
              optimizedFieldsByIdentifier[input.identifier];
            if (optimizedField && optimizedField.field_type === "input") {
              return {
                ...input,
                ...optimizedField,
              };
            }
            return input;
          });
          node_.data.outputs = node_.data.outputs?.map((output) => {
            const optimizedField =
              optimizedFieldsByIdentifier[output.identifier];
            if (optimizedField && optimizedField.field_type === "output") {
              return {
                ...output,
                ...optimizedField,
              };
            }
            return output;
          });
          return node_;
        }
        return node;
      })
    );

    setOpenResultsPanelRequest("closed");
    toast({
      title: "Optimizations Applied!",
      description: `${matchingNodes.length} ${
        matchingNodes.length === 1 ? "component was" : "components were"
      } updated.`,
      status: "success",
      duration: 5000,
      isClosable: true,
    });
  };

  const logsPanel = useDisclosure();
  const currentSelectedRun = selectedRuns_[0]!;
  const hasLogs = optimizationState?.run_id === currentSelectedRun;

  return (
    <HStack align="start" width="full" height="full" spacing={0} minWidth="0">
      <DSPyExperimentRunList
        dspyRuns={dspyRuns}
        selectedRuns={selectedRuns_}
        setSelectedRuns={setSelectedRuns_}
        setHighlightedRun={setHighlightedRun}
        dspyRunsPlusIncoming={dspyRunsPlusIncoming}
        size="sm"
        incomingRunIds={incomingRunIds}
      />
      <VStack align="start" width="full" height="full" spacing={0} minWidth="0">
        <VStack width="full" height="full" overflowY="auto" minWidth="0">
          {dspyRuns.isLoading ? (
            <Skeleton width="100%" height="30px" />
          ) : dspyRuns.error ? (
            <Alert status="error">
              <AlertIcon />
              Error loading experiment runs
            </Alert>
          ) : dspyRuns.data?.length === 0 ? (
            <Text>Waiting for the first completed step to arrive...</Text>
          ) : (
            dspyRuns.data && (
              <>
                <VStack width="full" paddingX={1} paddingY={2} align="start">
                  <Heading as="h2" size="sm" paddingLeft={4} paddingTop={2}>
                    {optimizerNames.length == 1
                      ? optimizerNames[0]!
                      : optimizerNames.length > 1
                      ? "Multiple Optimizers"
                      : "Waiting for the first completed step to arrive..."}
                  </Heading>
                  <DSPyRunsScoresChart
                    dspyRuns={dspyRuns.data}
                    selectedPoint={selectedPoint}
                    setSelectedPoint={setSelectedPoint}
                    highlightedRun={highlightedRun}
                    selectedRuns={selectedRuns_}
                    stepToDisplay={stepToDisplay}
                    labelNames={labelNames}
                  />
                </VStack>
                <Box
                  width="full"
                  height="full"
                  borderTop="1px solid"
                  borderColor="gray.200"
                >
                  {stepToDisplay &&
                    (!highlightedRun ||
                      highlightedRun === stepToDisplay.run_id) && (
                      <RunDetails
                        project={project}
                        experiment={experiment}
                        dspyStepSummary={stepToDisplay}
                        workflowVersion={
                          runsById?.[stepToDisplay.run_id]?.workflow_version
                        }
                        size="sm"
                      />
                    )}
                </Box>
              </>
            )
          )}
        </VStack>
        <Spacer />
        {runsById && selectedRuns_.length === 1 && (
          <DSPyExperimentSummary
            project={project}
            experiment={experiment}
            run={runsById?.[currentSelectedRun]}
            onApply={
              optimizationState?.status === "running" &&
              optimizationStateRunId === selectedRuns_[0]
                ? undefined
                : onApplyOptimizations
            }
            onViewLogs={
              !hasLogs ||
              logsPanel.isOpen ||
              optimizationState?.status === "running"
                ? undefined
                : logsPanel.onOpen
            }
          />
        )}
        {(selectedRuns.length === 0 ||
          selectedRuns.includes(optimizationStateRunId ?? "")) &&
          optimizationStateRunId &&
          optimizationState?.status === "running" && (
            <HStack
              width="full"
              padding={3}
              borderTop="1px solid"
              borderColor="gray.200"
            >
              <Text whiteSpace="nowrap" marginTop="-1px" paddingX={2}>
                Running
              </Text>
              <OptimizationProgressBar size="lg" />
              {hasLogs && !logsPanel.isOpen && (
                <Button
                  size="sm"
                  onClick={logsPanel.onOpen}
                  variant="ghost"
                  marginRight="-8px"
                >
                  <Box paddingX={4}>View Logs</Box>
                </Button>
              )}
              <Button
                colorScheme="red"
                onClick={() =>
                  stopOptimizationExecution({
                    run_id: optimizationStateRunId,
                  })
                }
                minHeight="28px"
                minWidth="0"
                paddingY="6px"
                marginLeft="8px"
              >
                <Box paddingX="6px">Stop</Box>
              </Button>
            </HStack>
          )}
        {logsPanel.isOpen && (
          <VStack
            width="full"
            borderTop="1px solid"
            borderColor="gray.200"
            height="100%"
            position="relative"
            minHeight="0"
          >
            <Button
              variant="ghost"
              onClick={logsPanel.onClose}
              position="absolute"
              top={1}
              right={1}
              size="xs"
              zIndex={1}
            >
              <ChevronDown size={16} />
            </Button>
            <Tabs
              size="sm"
              width="full"
              height="full"
              display="flex"
              flexDirection="column"
              minHeight="0"
            >
              <TabList>
                <Tab>Logs</Tab>
              </TabList>
              <TabPanels
                width="100%"
                height="100%"
                display="flex"
                minHeight="0"
              >
                <TabPanel
                  width="100%"
                  height="100%"
                  display="flex"
                  minHeight="0"
                  padding="0"
                >
                  <LogsPanel />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </VStack>
        )}
      </VStack>
    </HStack>
  );
}

function LogsPanel() {
  const { stdout } = useWorkflowStore(({ state }) => ({
    stdout: state.optimization?.stdout,
  }));

  const preRef = useRef<HTMLPreElement>(null);

  const scrollBottom = () => {
    const pre = preRef.current;
    if (!pre) return;
    pre.scrollTop = pre.scrollHeight;
  };

  useEffect(() => {
    setTimeout(scrollBottom, 100);
  }, []);

  useEffect(() => {
    setTimeout(scrollBottom, 24);
    setTimeout(scrollBottom, 100);
    setTimeout(scrollBottom, 500);
    setTimeout(scrollBottom, 1000);
  }, [stdout]);

  return (
    <pre
      ref={preRef}
      style={{
        whiteSpace: "pre-wrap",
        width: "100%",
        overflowY: "auto",
        minHeight: "0",
        padding: "12px 12px 16px 16px",
        background: "#2e2e2e",
        color: "#d6d6d6",
      }}
    >
      {stdout}
    </pre>
  );
}
