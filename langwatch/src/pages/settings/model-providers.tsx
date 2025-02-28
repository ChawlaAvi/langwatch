import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Card,
  CardBody,
  Checkbox,
  FormControl,
  Field,
  Grid,
  GridItem,
  HStack,
  Heading,
  Input,
  Skeleton,
  Spacer,
  Spinner,
  Switch,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { ProjectSelector } from "../../components/DashboardLayout";
import { HorizontalFormControl } from "../../components/HorizontalFormControl";
import {
  ModelSelector,
  modelSelectorOptions,
} from "../../components/ModelSelector";
import SettingsLayout from "../../components/SettingsLayout";
import { SmallLabel } from "../../components/SmallLabel";
import { useOrganizationTeamProject } from "../../hooks/useOrganizationTeamProject";
import { modelProviderIcons } from "../../server/modelProviders/iconsMap";
import {
  getProviderModelOptions,
  modelProviders as modelProvidersRegistry,
  type MaybeStoredModelProvider,
} from "../../server/modelProviders/registry";
import { allowedTopicClusteringModels } from "../../server/topicClustering/types";
import { api } from "../../utils/api";

import CreatableSelect from "react-select/creatable";
import {
  DEFAULT_EMBEDDINGS_MODEL,
  DEFAULT_TOPIC_CLUSTERING_MODEL,
} from "../../utils/constants";

export default function ModelsPage() {
  const { project, organizations } = useOrganizationTeamProject();
  const modelProviders = api.modelProvider.getAllForProject.useQuery(
    { projectId: project?.id ?? "" },
    { enabled: !!project }
  );
  const updateMutation = api.modelProvider.update.useMutation();

  return (
    <SettingsLayout>
      <VStack
        gap={6}
        width="full"
        maxWidth="920px"
        align="start"
        paddingY={6}
        paddingBottom={12}
        paddingX={4}
      >
        <HStack width="full" marginTop={6}>
          <Heading size="lg" as="h1">
            Model Providers
          </Heading>

          <Spacer />
          {updateMutation.isLoading && <Spinner />}
          {organizations && project && (
            <ProjectSelector organizations={organizations} project={project} />
          )}
        </HStack>
        <Text>
          Define which models are allowed to be used on LangWatch for this
          project. <br />
          You can also use your own API keys.
        </Text>
        <Card width="full">
          <CardBody width="full" paddingY={4}>
            <VStack gap={0} width="full">
              {modelProviders.isLoading &&
                Array.from({
                  length: Object.keys(modelProvidersRegistry).length,
                }).map((_, index) => (
                  <Box
                    key={index}
                    width="full"
                    borderBottomWidth="1px"
                    _last={{ border: "none" }}
                    paddingY={6}
                  >
                    <Skeleton width="full" height="28px" />
                  </Box>
                ))}
              {modelProviders.data &&
                Object.values(modelProviders.data).map((provider, index) => (
                  <ModelProviderForm
                    key={index}
                    provider={provider}
                    refetch={modelProviders.refetch}
                    updateMutation={updateMutation}
                  />
                ))}
            </VStack>
          </CardBody>
        </Card>
        <TopicClusteringModel />
        <EmbeddingsModel />
      </VStack>
    </SettingsLayout>
  );
}

type ModelProviderForm = {
  id?: string;
  provider: string;
  enabled: boolean;
  useCustomKeys: boolean;
  customKeys?: Record<string, unknown> | null;
  customModels?: { value: string; label: string }[] | null;
  customEmbeddingsModels?: { value: string; label: string }[] | null;
};

function ModelProviderForm({
  provider,
  refetch,
  updateMutation,
}: {
  provider: MaybeStoredModelProvider;
  refetch: () => Promise<any>;
  updateMutation: ReturnType<typeof api.modelProvider.update.useMutation>;
}) {
  const { project } = useOrganizationTeamProject();

  const localUpdateMutation = api.modelProvider.update.useMutation();
  const deleteMutation = api.modelProvider.delete.useMutation();

  const providerDefinition =
    modelProvidersRegistry[
      provider.provider as keyof typeof modelProvidersRegistry
    ]!;

  const getStoredModelOptions = (
    models: string[],
    provider: string,
    mode: "chat" | "embedding"
  ) => {
    if (!models || models.length === 0) {
      const options = getProviderModelOptions(provider, mode);
      return options;
    }
    return models.map((model) => ({
      value: model,
      label: model,
    }));
  };

  const { register, handleSubmit, formState, watch, setValue, control } =
    useForm<ModelProviderForm>({
      defaultValues: {
        id: provider.id,
        provider: provider.provider,
        enabled: provider.enabled,
        useCustomKeys: !!provider.customKeys,
        customKeys: provider.customKeys as object | null,
        customModels: getStoredModelOptions(
          provider.models ?? [],
          provider.provider,
          "chat"
        ),
        customEmbeddingsModels: getStoredModelOptions(
          provider.embeddingsModels ?? [],
          provider.provider,
          "embedding"
        ),
      },
      resolver: (data, ...args) => {
        const data_ = {
          ...data,
          customKeys: data.useCustomKeys ? data.customKeys : null,
          customModels: data.customModels ?? [],
          customEmbeddingsModels: data.customEmbeddingsModels ?? [],
        };

        return zodResolver(
          z.object({
            id: z.string().optional(),
            provider: z.enum(Object.keys(modelProvidersRegistry) as any),
            enabled: z.boolean(),
            useCustomKeys: z.boolean(),
            customKeys: providerDefinition.keysSchema.optional().nullable(),
            customModels: z
              .array(
                z.object({
                  value: z.string(),
                  label: z.string(),
                })
              )
              .optional()
              .nullable(),
            customEmbeddingsModels: z
              .array(
                z.object({
                  value: z.string(),
                  label: z.string(),
                })
              )
              .optional()
              .nullable(),
          })
        )(data_, ...args);
      },
    });

  const toast = useToast();

  const onSubmit = useCallback(
    async (data: ModelProviderForm) => {
      await localUpdateMutation.mutateAsync({
        id: provider.id,
        projectId: project?.id ?? "",
        provider: provider.provider,
        enabled: data.enabled,
        customKeys: data.useCustomKeys ? data.customKeys : null,
        customModels: (data.customModels ?? []).map((m) => m.value),
        customEmbeddingsModels: (data.customEmbeddingsModels ?? []).map(
          (m) => m.value
        ),
      });
      toast({
        title: "API Keys Updated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      await refetch();
    },
    [
      localUpdateMutation,
      provider.id,
      provider.provider,
      project?.id,
      toast,
      refetch,
    ]
  );

  const enabledField = register("enabled");
  const isEnabled = watch("enabled");
  const onEnableDisable = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      void enabledField.onChange(e);
      await updateMutation.mutateAsync({
        id: provider.id,
        projectId: project?.id ?? "",
        provider: provider.provider,
        enabled: e.target.checked,
        customKeys: provider.customKeys as any,
        customModels: provider.models ?? [],
        customEmbeddingsModels: provider.embeddingsModels ?? [],
      });

      if (e.target.checked && provider.disabledByDefault) {
        setValue("useCustomKeys", true);
      }

      await refetch();
    },
    [
      enabledField,
      updateMutation,
      provider.id,
      provider.provider,
      provider.customKeys,
      provider.models,
      provider.embeddingsModels,
      provider.disabledByDefault,
      project?.id,
      refetch,
      setValue,
    ]
  );

  const useCustomKeysField = register("useCustomKeys");
  const onUseCustomKeysChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await useCustomKeysField.onChange(e);
      if (!e.target.checked) {
        await deleteMutation.mutateAsync({
          id: provider.id ?? "",
          provider: provider.provider,
          projectId: project?.id ?? "",
        });

        setValue("customKeys", null);
        setValue("customModels", null);
        setValue("customEmbeddingsModels", null);

        if (provider.disabledByDefault) {
          setValue("enabled", false);
        }
        await refetch();
      }
      setValue(
        "customModels",
        getStoredModelOptions(
          provider.models ?? [],
          provider.provider,
          "chat"
        )
      );
      setValue(
        "customEmbeddingsModels",
        getStoredModelOptions(
          provider.embeddingsModels ?? [],
          provider.provider,
          "embedding"
        )
      );
    },
    [
      useCustomKeysField,
      setValue,
      provider,
      deleteMutation,
      project?.id,
      refetch,
    ]
  );

  const providerKeys =
    "shape" in providerDefinition.keysSchema
      ? providerDefinition.keysSchema.shape
      : providerDefinition.keysSchema._def.schema.shape;
  const useCustomKeys = watch("useCustomKeys");

  return (
    <Box
      width="full"
      borderBottomWidth="1px"
      _last={{ border: "none" }}
      paddingY={2}
    >
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={handleSubmit(onSubmit)} style={{ width: "100%" }}>
        <HorizontalFormControl
          label={
            <HStack paddingLeft={4}>
              <Box
                width="24px"
                height="24px"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {
                  modelProviderIcons[
                    provider.provider as keyof typeof modelProviderIcons
                  ]
                }
              </Box>
              <Text>{providerDefinition.name}</Text>
            </HStack>
          }
          helper={""}
        >
          <VStack align="start" width="full" gap={4} paddingRight={4}>
            <HStack gap={6}>
              <Switch
                {...enabledField}
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                onChange={onEnableDisable}
                isChecked={isEnabled}
              >
                Enabled
              </Switch>
              <Checkbox
                {...useCustomKeysField}
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                onChange={onUseCustomKeysChange}
                isChecked={useCustomKeys}
              >
                Use custom settings
              </Checkbox>
            </HStack>

            {useCustomKeys && (
              <>
                <FormControl isInvalid={!!formState.errors.customKeys}>
                  <Grid
                    templateColumns="auto auto"
                    gap={4}
                    rowGap={2}
                    paddingTop={4}
                    width="full"
                  >
                    <GridItem color="gray.500">
                      <SmallLabel>Key</SmallLabel>
                    </GridItem>
                    <GridItem color="gray.500">
                      <SmallLabel>Value</SmallLabel>
                    </GridItem>
                    {Object.keys(providerKeys).map((key) => (
                      <React.Fragment key={key}>
                        <GridItem alignContent="center" fontFamily="monospace">
                          {key}
                        </GridItem>
                        <GridItem>
                          <Input
                            {...register(`customKeys.${key}`)}
                            autoComplete="off"
                            placeholder={
                              (providerKeys as any)[key]._def.typeName ===
                              "ZodOptional"
                                ? "optional"
                                : undefined
                            }
                            isInvalid={!!formState.errors.customKeys?.[key]}
                          />
                        </GridItem>
                      </React.Fragment>
                    ))}
                  </Grid>
                  <Field.ErrorText>
                    {formState.errors.customKeys?.root?.message}
                  </Field.ErrorText>
                </FormControl>

                <VStack width="full" gap={4}>
                  <Box width="full">
                    <SmallLabel>Models</SmallLabel>
                    <Controller
                      name="customModels"
                      control={control}
                      render={({ field }) => (
                        <CreatableSelect
                          {...field}
                          isMulti
                          options={getProviderModelOptions(
                            provider.provider,
                            "chat"
                          )}
                          placeholder="Add custom model"
                        />
                      )}
                    />
                  </Box>
                  {(provider.provider === "openai" ||
                    provider.provider === "azure" ||
                    provider.provider === "gemini" ||
                    provider.provider === "bedrock") && (
                    <>
                      <Box width="full">
                        <SmallLabel>Embeddings Models</SmallLabel>
                        <Controller
                          name="customEmbeddingsModels"
                          control={control}
                          render={({ field }) => (
                            <CreatableSelect
                              {...field}
                              isMulti
                              options={getProviderModelOptions(
                                provider.provider,
                                "embedding"
                              )}
                              placeholder="Add custom embeddings model"
                            />
                          )}
                        />
                      </Box>
                    </>
                  )}
                </VStack>

                <HStack width="full">
                  <Spacer />
                  <Button
                    type="submit"
                    size="sm"
                    colorPalette="orange"
                    isLoading={localUpdateMutation.isLoading}
                  >
                    Save
                  </Button>
                </HStack>
                {provider.provider === "custom" && (
                  <Alert status="info">
                    <AlertIcon />
                    Custom provider supports only OpenAI compatible endpoints,
                    contact support if you have a custom format.
                  </Alert>
                )}
              </>
            )}
          </VStack>
        </HorizontalFormControl>
      </form>
    </Box>
  );
}

type TopicClusteringModelForm = {
  topicClusteringModel: string;
};

type EmbeddingsModelForm = {
  embeddingsModel: string;
};

function TopicClusteringModel() {
  const { project } = useOrganizationTeamProject();
  const updateTopicClusteringModel =
    api.project.updateTopicClusteringModel.useMutation();

  const { register, handleSubmit, control } = useForm<TopicClusteringModelForm>(
    {
      defaultValues: {
        topicClusteringModel:
          project?.topicClusteringModel ?? DEFAULT_TOPIC_CLUSTERING_MODEL,
      },
    }
  );

  const topicClusteringModelField = register("topicClusteringModel");

  const onUpdateSubmit = useCallback(
    async (data: TopicClusteringModelForm) => {
      await updateTopicClusteringModel.mutateAsync({
        projectId: project?.id ?? "",
        topicClusteringModel: data.topicClusteringModel,
      });
    },
    [updateTopicClusteringModel, project?.id]
  );

  return (
    <>
      <HStack width="full" marginTop={6}>
        <Heading size="md" as="h2">
          Topic Clustering Model
        </Heading>
        <Spacer />
        {updateTopicClusteringModel.isLoading && <Spinner />}
      </HStack>
      <Text>
        Select which model will be used to generate the topic names based on the
        messages
      </Text>
      <Card width="full">
        <CardBody width="full">
          <HorizontalFormControl label="Topic Clustering Model" helper="">
            <Controller
              name={topicClusteringModelField.name}
              control={control}
              render={({ field }) => (
                <ModelSelector
                  model={field.value}
                  options={allowedTopicClusteringModels}
                  // eslint-disable-next-line @typescript-eslint/no-misused-promises
                  onChange={(model) => {
                    field.onChange(model);
                    void handleSubmit(onUpdateSubmit)();
                  }}
                  mode="chat"
                />
              )}
            />
          </HorizontalFormControl>
        </CardBody>
      </Card>
    </>
  );
}

function EmbeddingsModel() {
  const { project } = useOrganizationTeamProject();
  const updateEmbeddingsModel = api.project.updateEmbeddingsModel.useMutation();

  const { register, handleSubmit, control } = useForm<EmbeddingsModelForm>({
    defaultValues: {
      embeddingsModel: project?.embeddingsModel ?? DEFAULT_EMBEDDINGS_MODEL,
    },
  });

  const embeddingsModelField = register("embeddingsModel");

  const onUpdateSubmit = useCallback(
    async (data: EmbeddingsModelForm) => {
      await updateEmbeddingsModel.mutateAsync({
        projectId: project?.id ?? "",
        embeddingsModel: data.embeddingsModel,
      });
    },
    [updateEmbeddingsModel, project?.id]
  );

  return (
    <>
      <HStack width="full" marginTop={6}>
        <Heading size="md" as="h2">
          Embeddings Model
        </Heading>
        <Spacer />
        {updateEmbeddingsModel.isLoading && <Spinner />}
      </HStack>
      <Text>
        Select which model will be used to generate embeddings for the messages
      </Text>
      <Card width="full">
        <CardBody width="full">
          <HorizontalFormControl label="Embeddings Model" helper="">
            <Controller
              name={embeddingsModelField.name}
              control={control}
              render={({ field }) => (
                <ModelSelector
                  model={field.value}
                  options={modelSelectorOptions
                    .filter((option) => option.mode === "embedding")
                    .map((option) => option.value)}
                  // eslint-disable-next-line @typescript-eslint/no-misused-promises
                  onChange={(model) => {
                    field.onChange(model);
                    void handleSubmit(onUpdateSubmit)();
                  }}
                  mode="embedding"
                />
              )}
            />
          </HorizontalFormControl>
        </CardBody>
      </Card>
    </>
  );
}
