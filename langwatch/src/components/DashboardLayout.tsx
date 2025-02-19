import { Link } from "@chakra-ui/next-js";
import {
  Alert,
  AlertIcon,
  Avatar,
  Badge,
  Box,
  Button,
  HStack,
  Hide,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuGroup,
  MenuItem,
  MenuList,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Spacer,
  Text,
  Tooltip,
  VStack,
  useTheme,
  type BoxProps,
} from "@chakra-ui/react";
import { type Organization, type Project, type Team } from "@prisma/client";
import { signIn, signOut } from "next-auth/react";
import ErrorPage from "next/error";
import Head from "next/head";
import { useRouter } from "next/router";
import numeral from "numeral";
import React, { useMemo, useState } from "react";
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Edit,
  Lock,
  MessageSquare,
  Play,
  Plus,
  Search,
  Settings,
  Shield,
  Table,
  TrendingUp,
} from "react-feather";
import { useOrganizationTeamProject } from "../hooks/useOrganizationTeamProject";
import { useRequiredSession } from "../hooks/useRequiredSession";
import { dependencies } from "../injection/dependencies.client";
import { OrganizationRoleGroup } from "../server/api/permission";
import type { FullyLoadedOrganization } from "../server/api/routers/organization";
import { api } from "../utils/api";
import { findCurrentRoute, projectRoutes, type Route } from "../utils/routes";
import { trackEvent } from "../utils/tracking";
import { CurrentDrawer } from "./CurrentDrawer";
import { IntegrationChecks, useIntegrationChecks } from "./IntegrationChecks";
import { LoadingScreen } from "./LoadingScreen";
import { ProjectTechStackIcon } from "./TechStack";
import { ChecklistIcon } from "./icons/Checklist";
import { GitHub } from "react-feather";
import { LogoIcon } from "./icons/LogoIcon";
import { PuzzleIcon } from "./icons/PuzzleIcon";
import { useTableView } from "./messages/HeaderButtons";
import { IconWrapper } from "./IconWrapper";
import { usePublicEnv } from "../hooks/usePublicEnv";
import { DiscordOutlineIcon } from "./icons/DiscordOutline";
import { ChatBalloonIcon } from "./icons/ChatBalloon";
import { HoverableBigText } from "./HoverableBigText";
import { useAnnotationQueues } from "~/hooks/useAnnotationQueues";

const Breadcrumbs = ({ currentRoute }: { currentRoute: Route | undefined }) => {
  const { project } = useOrganizationTeamProject();

  return (
    currentRoute && (
      <HStack gap={2} fontSize={13} color="gray.500">
        <Link href="/">Dashboard</Link>
        {currentRoute.parent && (
          <>
            <ChevronRight width="12" style={{ minWidth: "12px" }} />
            <Link
              href={projectRoutes[currentRoute.parent].path.replace(
                "[project]",
                project?.slug ?? ""
              )}
            >
              {projectRoutes[currentRoute.parent].title}
            </Link>
          </>
        )}
        <ChevronRight width="12" style={{ minWidth: "12px" }} />
        <HoverableBigText noOfLines={1} expandable={false}>
          {currentRoute.title}
        </HoverableBigText>
      </HStack>
    )
  );
};

const SideMenuLink = ({
  icon,
  label,
  path,
  project,
  badgeNumber,
}: {
  icon: React.ComponentType<{ size?: string | number; color?: string }>;
  label: string;
  path: string;
  project?: Project;
  badgeNumber?: number;
}) => {
  const router = useRouter();
  const currentRoute = findCurrentRoute(router.pathname);
  const { isTableView } = useTableView();

  const theme = useTheme();
  const orange400 = theme.colors.orange["400"];

  const IconElem = icon;

  const isActive =
    currentRoute?.path === path ||
    (path.includes("/messages") && router.pathname.includes("/messages")) ||
    (path.includes("/evaluations") &&
      router.pathname.includes("/evaluations")) ||
    (path.includes("/datasets") && router.pathname.includes("/datasets")) ||
    (path.includes("/experiments") &&
      router.pathname.includes("/experiments")) ||
    (path.includes("/playground") && router.pathname.includes("/playground")) ||
    (path === "/[project]" && router.pathname.includes("/analytics")) ||
    (path.includes("/annotations") &&
      router.pathname.includes("/annotations")) ||
    (path.includes("/settings") && router.pathname.includes("/settings"));

  const viewModeQuery = path.includes("/messages")
    ? isTableView
      ? "?view=table"
      : "?view=list"
    : "";

  return (
    <Tooltip
      label={label === "Home" ? "Analytics" : label}
      hasArrow
      placement="right"
      gutter={16}
    >
      <Link
        href={
          project
            ? path.replace("[project]", project.slug) + viewModeQuery
            : "/auth/signin"
        }
        aria-label={label}
        onClick={() => {
          trackEvent("side_menu_click", {
            project_id: project?.id,
            menu_item: label,
          });
        }}
      >
        <VStack position="relative">
          <IconElem size={24} color={isActive ? orange400 : undefined} />

          {badgeNumber && badgeNumber > 0 && (
            <Box position="absolute" top={4} left={4}>
              <Badge
                backgroundColor="green.500"
                color="white"
                borderRadius="full"
                paddingX={1.5}
              >
                {badgeNumber}
              </Badge>
            </Box>
          )}
        </VStack>
      </Link>
    </Tooltip>
  );
};

export const ProjectSelector = React.memo(function ProjectSelector({
  organizations,
  project,
}: {
  organizations: FullyLoadedOrganization[];
  project: Project;
}) {
  const router = useRouter();
  const currentRoute = findCurrentRoute(router.pathname);
  const { data: session } = useRequiredSession();

  const sortByName = (a: { name: string }, b: { name: string }) =>
    a.name.toLowerCase() < b.name.toLowerCase()
      ? -1
      : a.name.toLowerCase() > b.name.toLowerCase()
      ? 1
      : 0;

  const projectGroups = organizations.sort(sortByName).flatMap((organization) =>
    organization.teams.flatMap((team) => ({
      organization,
      team,
      projects: team.projects.sort(sortByName),
    }))
  );

  const [isOpen, setIsOpen] = useState(false);

  return (
    <Menu
      isOpen={isOpen}
      onOpen={() => setIsOpen(true)}
      onClose={() => setIsOpen(false)}
    >
      <MenuButton
        as={Button}
        variant="outline"
        borderColor="gray.300"
        fontSize={13}
        paddingX={4}
        paddingY={1}
        height="auto"
        fontWeight="normal"
        minWidth="fit-content"
      >
        <HStack gap={2}>
          <ProjectTechStackIcon project={project} />
          <Box>{project.name}</Box>
          <Box>
            <ChevronDown width={14} />
          </Box>
        </HStack>
      </MenuButton>
      <Portal>
        <Box zIndex="popover" padding={0}>
          {isOpen && (
            <MenuList zIndex="popover">
              <>
                {projectGroups
                  .filter((projectGroup) =>
                    projectGroup.team.members.some(
                      (member) => member.userId === session?.user.id
                    )
                  )
                  .map((projectGroup) => (
                    <MenuGroup
                      key={projectGroup.team.id}
                      title={
                        projectGroup.organization.name +
                        (projectGroup.team.name !==
                        projectGroup.organization.name
                          ? " - " + projectGroup.team.name
                          : "")
                      }
                    >
                      {projectGroup.projects.map((project) => (
                        <Link
                          key={project.id}
                          href={
                            currentRoute?.path.includes("[project]")
                              ? currentRoute.path
                                  .replace("[project]", project.slug)
                                  .replace(/\[.*?\]/g, "")
                                  .replace(/\/\/+/g, "/")
                              : `/${project.slug}?return_to=${window.location.pathname}`
                          }
                          _hover={{
                            textDecoration: "none",
                          }}
                        >
                          <MenuItem
                            icon={
                              <HStack width="26px" justify="center">
                                <ProjectTechStackIcon project={project} />
                              </HStack>
                            }
                            fontSize="14px"
                          >
                            {project.name}
                          </MenuItem>
                        </Link>
                      ))}
                      <AddProjectButton
                        team={projectGroup.team}
                        organization={projectGroup.organization}
                      />
                    </MenuGroup>
                  ))}
              </>
            </MenuList>
          )}
        </Box>
      </Portal>
    </Menu>
  );
});

export const AddProjectButton = ({
  team,
  organization,
}: {
  team: Team;
  organization: Organization;
}) => {
  const { project } = useOrganizationTeamProject();
  const usage = api.limits.getUsage.useQuery(
    { organizationId: organization.id },
    {
      enabled: !!organization,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );

  return !usage.data ||
    usage.data.projectsCount < usage.data.activePlan.maxProjects ? (
    <Link
      href={`/onboarding/${team.slug}/project`}
      _hover={{
        textDecoration: "none",
      }}
    >
      <MenuItem icon={<Plus />} fontSize="14px">
        New Project
      </MenuItem>
    </Link>
  ) : (
    <Tooltip label="You reached the limit of max new projects, click to upgrade your plan to add more projects">
      <Link
        href={`/settings/subscription`}
        _hover={{
          textDecoration: "none",
        }}
        onClick={() => {
          trackEvent("subscription_hook_click", {
            project_id: project?.id,
            hook: "new_project",
          });
        }}
      >
        <MenuItem
          icon={<Lock />}
          fontSize="14px"
          color="gray.400"
          _hover={{
            backgroundColor: "transparent",
          }}
        >
          New Project
        </MenuItem>
      </Link>
    </Tooltip>
  );
};

export const DashboardLayout = ({
  children,
  publicPage = false,
  ...props
}: { publicPage?: boolean } & BoxProps) => {
  const router = useRouter();
  const theme = useTheme();
  const gray400 = theme.colors.gray["400"];

  const { data: session } = useRequiredSession({ required: !publicPage });

  const {
    isLoading,
    organization,
    organizations,
    team,
    project,
    hasOrganizationPermission,
    isPublicRoute,
  } = useOrganizationTeamProject();
  const usage = api.limits.getUsage.useQuery(
    { organizationId: organization?.id ?? "" },
    {
      enabled: !!organization,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );
  const publicEnv = usePublicEnv();

  const [query, setQuery] = useState(router.query.query as string);

  const { assignedQueueItems, memberAccessibleQueueItems } =
    useAnnotationQueues();

  const totalQueueItems = useMemo(
    () =>
      (assignedQueueItems?.filter((item) => !item.doneAt)?.length ?? 0) +
      (memberAccessibleQueueItems?.filter((item) => !item.doneAt)?.length ?? 0),
    [assignedQueueItems, memberAccessibleQueueItems]
  );

  const integrationChecks = useIntegrationChecks();

  const integrationsLeft = useMemo(() => {
    return Object.entries(integrationChecks.data ?? {}).filter(
      ([key, value]) => key !== "integrated" && !value
    ).length;
  }, [integrationChecks.data]);

  if (typeof router.query.project === "string" && !isLoading && !project) {
    return <ErrorPage statusCode={404} />;
  }

  if (
    !publicPage &&
    (!session ||
      isLoading ||
      !organization ||
      !organizations ||
      !team ||
      !project)
  ) {
    return <LoadingScreen />;
  }

  const user = session?.user;
  const currentRoute = findCurrentRoute(router.pathname);

  return (
    <HStack width="full" minHeight="100vh" alignItems={"stretch"} spacing={0}>
      <Head>
        <title>
          LangWatch{project ? ` - ${project.name}` : ""}
          {currentRoute && currentRoute.title != "Home"
            ? ` - ${currentRoute?.title}`
            : ""}
        </title>
      </Head>
      <Box
        borderRightWidth="1px"
        borderRightColor="gray.300"
        background="white"
      >
        <VStack
          paddingX={6}
          paddingY={8}
          spacing={6}
          position="sticky"
          top={0}
          height="100vh"
        >
          <Box fontSize={32} fontWeight="bold">
            <LogoIcon width={25} height={34} />
          </Box>

          <VStack height="full" spacing={7}>
            <SideMenuLink
              path={projectRoutes.workflows.path}
              icon={PuzzleIcon}
              label={projectRoutes.workflows.title}
              project={project}
            />

            <SideMenuLink
              path={projectRoutes.home.path}
              icon={TrendingUp}
              label={projectRoutes.home.title}
              project={project}
            />
            <SideMenuLink
              path={projectRoutes.messages.path}
              icon={MessageSquare}
              label={projectRoutes.messages.title}
              project={project}
            />
            {/* <SideMenuLink
              path={projectRoutes.analytics.path}
              icon={TrendingUp}
              label={projectRoutes.analytics.title}
              project={project}
            />*/}
            <SideMenuLink
              path={projectRoutes.evaluations.path}
              icon={Shield}
              label={projectRoutes.evaluations.title}
              project={project}
            />
            {/* <SideMenuLink
              path={projectRoutes.playground.path}
              icon={ImageIcon}
              label={projectRoutes.playground.title}
              project={project}
            /> */}

            <SideMenuLink
              path={projectRoutes.datasets.path}
              icon={Table}
              label={projectRoutes.datasets.title}
              project={project}
            />
            <SideMenuLink
              path={projectRoutes.annotations.path}
              icon={Edit}
              label={projectRoutes.annotations.title}
              project={project}
              badgeNumber={totalQueueItems}
            />
            <SideMenuLink
              path={projectRoutes.triggers.path}
              icon={Bell}
              label={projectRoutes.triggers.title}
              project={project}
            />
            <SideMenuLink
              path={projectRoutes.experiments.path}
              icon={Play}
              label={projectRoutes.experiments.title}
              project={project}
            />

            {/*<SideMenuLink
              path={projectRoutes.prompts.path}
              icon={Database}
              label={projectRoutes.prompts.title}
              project={project}
            /> */}
            {(!!hasOrganizationPermission(
              OrganizationRoleGroup.ORGANIZATION_VIEW
            ) ||
              isPublicRoute) && (
              <SideMenuLink
                path={projectRoutes.settings.path}
                icon={Settings}
                label={projectRoutes.settings.title}
                project={project}
              />
            )}

            <Spacer />
            <VStack spacing={6}>
              <Tooltip
                hasArrow
                placement="right"
                gutter={16}
                label="Documentation"
              >
                <Link href="https://docs.langwatch.ai" target="_blank">
                  <IconWrapper width="20px" height="20px">
                    <BookOpen />
                  </IconWrapper>
                </Link>
              </Tooltip>

              <>
                <Tooltip
                  hasArrow
                  placement="right"
                  gutter={16}
                  label="Star us on GitHub"
                >
                  <Link
                    href="https://github.com/langwatch/langwatch"
                    target="_blank"
                  >
                    <IconWrapper width="20px" height="20px">
                      <GitHub />
                    </IconWrapper>
                  </Link>
                </Tooltip>
                <Tooltip
                  hasArrow
                  placement="right"
                  gutter={16}
                  label="Join our community"
                >
                  <Link href="https://discord.gg/kT4PhDS2gH" target="_blank">
                    <IconWrapper width="20px" height="20px">
                      <DiscordOutlineIcon />
                    </IconWrapper>
                  </Link>
                </Tooltip>
              </>
            </VStack>
            {(window as any)?.$crisp && (
              <Tooltip hasArrow placement="right" gutter={16} label="Live Help">
                <Button
                  position="relative"
                  color="white"
                  variant="link"
                  size="xs"
                  padding={2}
                  marginX={-2}
                  borderRadius="full"
                  minWidth={0}
                  minHeight={0}
                  onClick={() => {
                    (window as any)?.$crisp.push(["do", "chat:show"]);
                    (window as any)?.$crisp.push(["do", "chat:toggle"]);
                  }}
                  backgroundColor="blue.500"
                  _hover={{
                    transform: "scale(1.2)",
                  }}
                  _active={{
                    color: "white",
                  }}
                >
                  <ChatBalloonIcon width={20} height={20} />
                  <Box
                    position="absolute"
                    bottom="0px"
                    right="0px"
                    width="10px"
                    height="10px"
                    borderRadius="full"
                    backgroundColor="green.500"
                    border="1px solid"
                    borderColor="white"
                  />
                </Button>
              </Tooltip>
            )}
          </VStack>
        </VStack>
      </Box>
      <VStack
        width="full"
        maxWidth="calc(100vw - 90px)"
        spacing={0}
        background="gray.100"
        {...props}
      >
        {usage.data &&
          usage.data.currentMonthMessagesCount >=
            usage.data.activePlan.maxMessagesPerMonth && (
            <Alert
              status="warning"
              width="full"
              borderBottom="1px solid"
              borderBottomColor="yellow.300"
            >
              <AlertIcon />
              <Text>
                You reached the limit of{" "}
                {numeral(usage.data.activePlan.maxMessagesPerMonth).format()}{" "}
                messages for this month, new messages will not be processed.{" "}
                <Link
                  href="/settings/subscription"
                  textDecoration="underline"
                  _hover={{
                    textDecoration: "none",
                  }}
                  onClick={() => {
                    trackEvent("subscription_hook_click", {
                      project_id: project?.id,
                      hook: "new_messages_limit_reached",
                    });
                  }}
                >
                  Click here
                </Link>{" "}
                to upgrade your plan.
              </Text>
            </Alert>
          )}
        {usage.data &&
          usage.data.currentMonthCost > usage.data.maxMonthlyUsageLimit && (
            <Alert
              status="warning"
              width="full"
              borderBottom="1px solid"
              borderBottomColor="yellow.300"
            >
              <AlertIcon />
              <Text>
                You reached the limit of{" "}
                {numeral(usage.data.maxMonthlyUsageLimit).format("$0.00")} usage
                cost for this month, evaluations and guardrails will not be
                processed.{" "}
                <Link
                  href="/settings/usage"
                  textDecoration="underline"
                  _hover={{
                    textDecoration: "none",
                  }}
                  onClick={() => {
                    trackEvent("subscription_hook_click", {
                      project_id: project?.id,
                      hook: "usage_cost_limit_reached",
                    });
                  }}
                >
                  Go to settings
                </Link>{" "}
                to check your usage spending limit or upgrade your plan.
              </Text>
            </Alert>
          )}
        <HStack
          position="relative"
          zIndex={3}
          width="full"
          padding={4}
          background="white"
          borderBottomWidth="1px"
          borderBottomColor="gray.300"
          justifyContent="space-between"
        >
          <HStack gap={6} flex={1.5}>
            {organizations && project && (
              <ProjectSelector
                organizations={organizations}
                project={project}
              />
            )}
            {!project && (
              <Text paddingLeft={2}>
                <Link href="/auth/signin" color="orange.600" fontWeight="600">
                  Sign in
                </Link>{" "}
                to LangWatch to monitor your projects
              </Text>
            )}
            <Hide below="lg">
              <Breadcrumbs currentRoute={currentRoute} />
            </Hide>
          </HStack>
          {project && (
            <form
              action={`${project.slug}/messages`}
              method="GET"
              style={{ flex: 2, maxWidth: "600px" }}
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  router.query.view === "list" ||
                  router.query.view === "table"
                ) {
                  void router.replace({ query: { ...router.query, query } });
                } else {
                  void router.push(
                    `/${project.slug}/messages?query=${encodeURIComponent(
                      query
                    )}`
                  );
                }
              }}
            >
              <InputGroup borderColor="gray.300">
                <InputLeftElement
                  paddingY={1.5}
                  height="auto"
                  pointerEvents="none"
                >
                  <Search color={gray400} width={16} />
                </InputLeftElement>
                <Input
                  name="query"
                  type="search"
                  placeholder="Search"
                  _placeholder={{ color: "gray.800" }}
                  fontSize={14}
                  paddingY={1.5}
                  height="auto"
                  value={query ?? router.query.query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </InputGroup>
            </form>
          )}
          <HStack gap={6} flex={1}>
            <Spacer />
            <HStack spacing={4}>
              {integrationsLeft ? (
                <Popover placement="bottom-end">
                  <PopoverTrigger>
                    <Button position="relative" variant="ghost">
                      <ChecklistIcon />
                      <Badge
                        position="absolute"
                        bottom="2px"
                        right="2px"
                        size="sm"
                        color="white"
                        backgroundColor="green.500"
                        borderRadius="full"
                      >
                        {integrationsLeft}
                      </Badge>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <PopoverBody padding={4}>
                      <IntegrationChecks />
                    </PopoverBody>
                  </PopoverContent>
                </Popover>
              ) : (
                <Box width={["auto", "auto", "auto", "55px"]} />
              )}
              <Menu>
                <MenuButton
                  as={Button}
                  variant="unstyled"
                  {...(publicPage
                    ? { onClick: () => void signIn("auth0") }
                    : {})}
                >
                  <Avatar
                    name={user?.name ?? undefined}
                    backgroundColor={"orange.400"}
                    color="white"
                    size="sm"
                  />
                </MenuButton>
                {session && (
                  <Portal>
                    <MenuList zIndex="popover">
                      {dependencies.ExtraMenuItems && (
                        <dependencies.ExtraMenuItems />
                      )}
                      <MenuGroup
                        title={`${session.user.name} (${session.user.email})`}
                      >
                        <MenuItem
                          onClick={() =>
                            void signOut({
                              callbackUrl: window.location.origin,
                            })
                          }
                        >
                          Logout
                        </MenuItem>
                      </MenuGroup>
                    </MenuList>
                  </Portal>
                )}
              </Menu>
            </HStack>
          </HStack>
        </HStack>
        {publicEnv.data?.DEMO_PROJECT_SLUG &&
          publicEnv.data.DEMO_PROJECT_SLUG === router.query.project && (
            <HStack width={"full"} backgroundColor={"orange.400"} padding={1}>
              <Spacer />
              <Text fontSize={"sm"}>
                Viewing Demo Project - Go back to yours{" "}
                <Link href={"/"} textDecoration={"underline"}>
                  here
                </Link>
              </Text>
              <Spacer />
            </HStack>
          )}
        <CurrentDrawer />
        {children}
      </VStack>
    </HStack>
  );
};
