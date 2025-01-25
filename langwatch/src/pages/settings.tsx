import {
  Card,
  CardBody,
  FormErrorMessage,
  HStack,
  Heading,
  Input,
  Link,
  Spacer,
  Spinner,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { PIIRedactionLevel, type Project } from "@prisma/client";
import isEqual from "lodash.isequal";
import { useEffect, useState } from "react";
import {
  useForm,
  useWatch,
  type SubmitHandler,
  Controller,
} from "react-hook-form";
import { useDebouncedCallback } from "use-debounce";
import { HorizontalFormControl } from "~/components/HorizontalFormControl";
import { ProjectSelector } from "../components/DashboardLayout";
import SettingsLayout from "../components/SettingsLayout";
import {
  ProjectTechStackIcon,
  TechStackSelector,
} from "../components/TechStack";
import { useOrganizationTeamProject } from "../hooks/useOrganizationTeamProject";
import { OrganizationRoleGroup, TeamRoleGroup } from "../server/api/permission";
import type { FullyLoadedOrganization } from "../server/api/routers/organization";
import { Select as MultiSelect, chakraComponents } from "chakra-react-select";
import { api } from "../utils/api";
import { usePublicEnv } from "../hooks/usePublicEnv";

type OrganizationFormData = {
  name: string;
  s3Endpoint: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
};

export default function Settings() {
  const { organization, project } = useOrganizationTeamProject();

  if (!organization || !project) return null;

  return <SettingsForm organization={organization} project={project} />;
}

function SettingsForm({
  organization,
  project,
}: {
  organization: FullyLoadedOrganization;
  project: Project;
}) {
  const { hasOrganizationPermission, hasTeamPermission } =
    useOrganizationTeamProject();
  const [defaultValues, setDefaultValues] = useState<OrganizationFormData>({
    name: organization.name,
    s3Endpoint: organization.s3Endpoint ?? "",
    s3AccessKeyId: organization.s3AccessKeyId ?? "",
    s3SecretAccessKey: organization.s3SecretAccessKey ?? "",
  });
  const { register, handleSubmit, control, getFieldState } = useForm({
    defaultValues,
  });
  const formWatch = useWatch({ control });
  const updateOrganization = api.organization.update.useMutation();
  const apiContext = api.useContext();
  const toast = useToast();

  const onSubmit: SubmitHandler<OrganizationFormData> = useDebouncedCallback(
    (data: OrganizationFormData) => {
      if (isEqual(data, defaultValues)) return;

      setDefaultValues(data);

      updateOrganization.mutate(
        {
          organizationId: organization.id,
          name: data.name,
          s3Endpoint: data.s3Endpoint,
          s3AccessKeyId: data.s3AccessKeyId,
          s3SecretAccessKey: data.s3SecretAccessKey,
        },
        {
          onSuccess: () => {
            void apiContext.organization.getAll.refetch();
          },
          onError: () => {
            toast({
              title: "Failed to create organization",
              description: "Please try that again",
              status: "error",
              duration: 5000,
              isClosable: true,
              position: "top-right",
            });
          },
        }
      );
    },
    250
  );

  useEffect(() => {
    void handleSubmit(onSubmit)();
  }, [formWatch, handleSubmit, onSubmit]);

  return (
    <SettingsLayout>
      <VStack
        paddingX={4}
        paddingY={6}
        spacing={6}
        width="full"
        maxWidth="920px"
        align="start"
      >
        <HStack width="full">
          <Heading size="lg" as="h1">
            Organization Settings
          </Heading>
          <Spacer />
          {updateOrganization.isLoading && <Spinner />}
        </HStack>
        <Card width="full">
          <CardBody width="full" paddingY={2}>
            <form onSubmit={void handleSubmit(onSubmit)}>
              <VStack spacing={0}>
                <HorizontalFormControl
                  label="Name"
                  helper="The name of your organization"
                  isInvalid={!!getFieldState("name").error}
                >
                  {hasOrganizationPermission(
                    OrganizationRoleGroup.ORGANIZATION_MANAGE
                  ) ? (
                    <>
                      <Input
                        width="full"
                        type="text"
                        {...register("name", {
                          required: true,
                          validate: (value) => {
                            if (!value.trim()) return false;
                          },
                        })}
                      />
                      <FormErrorMessage>Name is required</FormErrorMessage>
                    </>
                  ) : (
                    <Text>{organization.name}</Text>
                  )}
                </HorizontalFormControl>
                <HorizontalFormControl
                  label="Slug"
                  helper="The unique ID of your organization"
                >
                  {hasOrganizationPermission(
                    OrganizationRoleGroup.ORGANIZATION_MANAGE
                  ) ? (
                    <Input
                      width="full"
                      disabled
                      type="text"
                      value={organization.slug}
                    />
                  ) : (
                    <Text>{organization.slug}</Text>
                  )}
                </HorizontalFormControl>
                <HorizontalFormControl
                  label="S3 Storage"
                  helper="Configure S3 storage to host data on your own infrastructure. Leave empty to use LangWatch's managed storage."
                >
                  {hasOrganizationPermission(
                    OrganizationRoleGroup.ORGANIZATION_MANAGE
                  ) ? (
                    <VStack width="full" align="start" spacing={3}>
                      <Input
                        width="full"
                        type="text"
                        placeholder="S3 Endpoint (e.g. http://localhost:9000)"
                        {...register("s3Endpoint")}
                      />
                      <Input
                        width="full"
                        type="text"
                        placeholder="Access Key ID"
                        {...register("s3AccessKeyId")}
                      />
                      <Input
                        width="full"
                        type="password"
                        placeholder="Secret Access Key"
                        {...register("s3SecretAccessKey")}
                      />
                    </VStack>
                  ) : (
                    <Text>
                      S3 storage configuration is only visible to organization
                      managers
                    </Text>
                  )}
                </HorizontalFormControl>
              </VStack>
            </form>
          </CardBody>
        </Card>
        {hasTeamPermission(TeamRoleGroup.SETUP_PROJECT) && (
          <ProjectSettingsForm project={project} />
        )}
      </VStack>
    </SettingsLayout>
  );
}

type ProjectFormData = {
  name: string;
  language: string;
  framework: string;
  userLinkTemplate?: string;
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  piiRedactionLevel: {
    label: string;
    value: PIIRedactionLevel;
    description?: string;
  };
};

function ProjectSettingsForm({ project }: { project: Project }) {
  const { organization, organizations } = useOrganizationTeamProject();
  const publicEnv = usePublicEnv();

  const piiRedactionLevelOptions: ProjectFormData["piiRedactionLevel"][] = [
    {
      label: "Strict",
      value: PIIRedactionLevel.STRICT,
      description: "Redacts all PII data including names and addresses",
    },
    {
      label: "Essential",
      value: PIIRedactionLevel.ESSENTIAL,
      description:
        "Redacts only essential PII data like email addresses, phone numbers, credit card numbers and IP addresses",
    },
    ...(!!organization?.signedDPA ||
    !publicEnv.data?.IS_SAAS ||
    publicEnv.data?.NODE_ENV === "development"
      ? [
          {
            label: "Disabled",
            value: PIIRedactionLevel.DISABLED,
            description: "PII data will not be redacted",
          },
        ]
      : []),
  ];

  const [defaultValues, setDefaultValues] = useState<ProjectFormData>({
    name: project.name,
    language: project.language,
    framework: project.framework,
    userLinkTemplate: project.userLinkTemplate ?? "",
    s3Endpoint: project.s3Endpoint ?? "",
    s3AccessKeyId: project.s3AccessKeyId ?? "",
    s3SecretAccessKey: project.s3SecretAccessKey ?? "",
    piiRedactionLevel: piiRedactionLevelOptions.find(
      (x) => x.value === project.piiRedactionLevel
    )!,
  });
  const form = useForm({
    defaultValues,
  });
  const { register, handleSubmit, control, formState } = form;
  const formWatch = useWatch({ control });
  const updateProject = api.project.update.useMutation();
  const apiContext = api.useContext();
  const toast = useToast();
  const [changeLanguageFramework, setChangeLanguageFramework] = useState(false);

  const onSubmit: SubmitHandler<ProjectFormData> = useDebouncedCallback(
    (data: ProjectFormData) => {
      if (isEqual(data, defaultValues)) return;

      setDefaultValues(data);

      updateProject.mutate(
        {
          projectId: project.id,
          ...data,
          piiRedactionLevel: data.piiRedactionLevel.value,
          userLinkTemplate: data.userLinkTemplate ?? "",
          s3Endpoint: data.s3Endpoint ?? "",
          s3AccessKeyId: data.s3AccessKeyId ?? "",
          s3SecretAccessKey: data.s3SecretAccessKey ?? "",
        },
        {
          onSuccess: () => {
            void apiContext.organization.getAll.refetch();
          },
          onError: () => {
            toast({
              title: "Failed to create organization",
              description: "Please try that again",
              status: "error",
              duration: 5000,
              isClosable: true,
              position: "top-right",
            });
          },
        }
      );
    },
    250
  );

  useEffect(() => {
    void handleSubmit(onSubmit)();
  }, [formWatch, handleSubmit, onSubmit]);

  return (
    <>
      <HStack width="full" marginTop={6}>
        <Heading size="lg" as="h1">
          Project-level Settings
        </Heading>
        <Spacer />
        {updateProject.isLoading && <Spinner />}
        {organizations && (
          <ProjectSelector organizations={organizations} project={project} />
        )}
      </HStack>
      <Card width="full">
        <CardBody width="full" paddingY={2}>
          <form onSubmit={void handleSubmit(onSubmit)}>
            <HorizontalFormControl
              label="Name"
              helper="The name of the project"
              isInvalid={!!formState.errors.name}
            >
              <Input
                width="full"
                type="text"
                {...register("name", {
                  required: true,
                  validate: (value) => {
                    if (!value.trim()) return false;
                  },
                })}
              />
              <FormErrorMessage>Name is required</FormErrorMessage>
            </HorizontalFormControl>
            <HorizontalFormControl
              label="Tech Stack"
              helper="The project language and framework"
              isInvalid={
                !!formState.errors.language || !!formState.errors.framework
              }
            >
              {changeLanguageFramework ? (
                <TechStackSelector form={form} />
              ) : (
                <HStack>
                  <ProjectTechStackIcon project={project} />
                  <Text>
                    {project.language} / {project.framework}
                  </Text>
                  <Link
                    textDecoration="underline"
                    onClick={() => setChangeLanguageFramework(true)}
                  >
                    (change)
                  </Link>
                </HStack>
              )}
            </HorizontalFormControl>
            <HorizontalFormControl
              label="PII Redaction Level"
              helper="The level of redaction for PII"
              isInvalid={!!formState.errors.piiRedactionLevel}
            >
              <Controller
                control={control}
                name="piiRedactionLevel"
                rules={{ required: "PII Redaction Level is required" }}
                render={({ field }) => (
                  <MultiSelect
                    {...field}
                    options={piiRedactionLevelOptions}
                    hideSelectedOptions={false}
                    isSearchable={false}
                    useBasicStyles
                    components={{
                      Menu: ({ children, ...props }) => (
                        <chakraComponents.Menu
                          {...props}
                          innerProps={{
                            ...props.innerProps,
                            style: { width: "300px" },
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
                              {props.data.description}
                            </Text>
                          </VStack>
                        </chakraComponents.Option>
                      ),
                    }}
                  />
                )}
              />
            </HorizontalFormControl>
            <HorizontalFormControl
              label="External User Link"
              helper="Linkify user_ids using a template URL"
            >
              <Input
                width="full"
                type="text"
                placeholder="https://example.com/user/{{user_id}}"
                {...register("userLinkTemplate")}
              />
            </HorizontalFormControl>
            <HorizontalFormControl
              label="S3 Storage"
              helper="Configure project-specific S3 storage settings for datasets. If left empty, organization-level settings will be used."
            >
              <VStack width="full" align="start" spacing={3}>
                <Input
                  width="full"
                  type="text"
                  placeholder="S3 Endpoint (e.g. http://localhost:9000)"
                  {...register("s3Endpoint")}
                />
                <Input
                  width="full"
                  type="text"
                  placeholder="Access Key ID"
                  {...register("s3AccessKeyId")}
                />
                <Input
                  width="full"
                  type="password"
                  placeholder="Secret Access Key"
                  {...register("s3SecretAccessKey")}
                />
              </VStack>
            </HorizontalFormControl>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
