import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  HStack,
  Progress,
  Spacer,
  VStack,
} from "@chakra-ui/react";
import { useWorkflowStore } from "../hooks/useWorkflowStore";
import { useEvaluationExecution } from "../hooks/useEvaluationExecution";
import { useOptimizationExecution } from "../hooks/useOptimizationExecution";
import { EvaluationProgressBar } from "../../components/experiments/BatchEvaluationV2/EvaluationProgressBar";

export function ProgressToast() {
  return (
    <VStack spacing={4}>
      <EvaluationProgressToast />
      <OptimizationProgressToast />
    </VStack>
  );
}

export function EvaluationProgressToast() {
  const { evaluationState, setOpenResultsPanelRequest } = useWorkflowStore(
    ({ state, setOpenResultsPanelRequest }) => ({
      evaluationState: state.evaluation,
      setOpenResultsPanelRequest,
    })
  );

  const { stopEvaluationExecution } = useEvaluationExecution();

  const isRunning = evaluationState?.status === "running";

  if (!isRunning) {
    return null;
  }

  return (
    <BaseProgressToast
      description="Running evaluation"
      progress={<EvaluationProgressBar evaluationState={evaluationState} />}
      onClick={() => {
        setOpenResultsPanelRequest("evaluations");
      }}
      onCancel={() => {
        stopEvaluationExecution({
          run_id: evaluationState?.run_id ?? "",
        });
      }}
    />
  );
}

export function OptimizationProgressToast() {
  const { optimizationState, setOpenResultsPanelRequest } = useWorkflowStore(
    ({ state, setOpenResultsPanelRequest }) => ({
      optimizationState: state.optimization,
      setOpenResultsPanelRequest,
    })
  );

  const { stopOptimizationExecution } = useOptimizationExecution();

  const isRunning = optimizationState?.status === "running";

  if (!isRunning) {
    return null;
  }

  return (
    <BaseProgressToast
      description="Running optimization"
      progress={<OptimizationProgressBar />}
      onClick={() => {
        setOpenResultsPanelRequest("optimizations");
      }}
      onCancel={() => {
        stopOptimizationExecution({
          run_id: optimizationState?.run_id ?? "",
        });
      }}
    />
  );
}

export function BaseProgressToast({
  description,
  progress,
  onClick,
  onCancel,
}: {
  description: string;
  progress: React.ReactNode;
  onClick: () => void;
  onCancel: () => void;
}) {
  return (
    <Alert
      status="info"
      position="absolute"
      bottom="3"
      right="3"
      zIndex={100}
      width="fit-content"
      background="white"
      padding={1}
      borderRadius="md"
      border="1px solid"
      borderColor="gray.200"
      onClick={onClick}
    >
      <VStack align="start" spacing={1}>
        <VStack align="start" spacing={1} paddingY={2} paddingX={3}>
          <HStack spacing={0}>
            <AlertIcon />
            <AlertTitle>Please wait...</AlertTitle>
          </HStack>
          <HStack minWidth="300px">
            <AlertDescription fontSize="14px">{description}</AlertDescription>
            <Spacer />
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
            >
              Cancel
            </Button>
          </HStack>
        </VStack>
        {progress}
      </VStack>
    </Alert>
  );
}

export function OptimizationProgressBar({
  size = "xs",
}: {
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const isIndeterminate = true;

  return (
    <HStack width="full" spacing={4}>
      <Progress
        size={size}
        width="full"
        colorScheme="blue"
        isIndeterminate={isIndeterminate}
        isAnimated
        borderRadius="sm"
        hasStripe
      />
    </HStack>
  );
}
