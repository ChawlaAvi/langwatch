import { toaster } from "../../components/ui/toaster";
import { useCallback, useEffect, useRef } from "react";
import { useOrganizationTeamProject } from "../../hooks/useOrganizationTeamProject";
import { getDebugger } from "../../utils/logger";
import type { StudioClientEvent, StudioServerEvent } from "../types/events";
import { useAlertOnComponent } from "./useAlertOnComponent";
import { useWorkflowStore } from "./useWorkflowStore";

const DEBUGGING_ENABLED = true;

if (DEBUGGING_ENABLED) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("debug").enable("langwatch:studio:*");
}

const debug = getDebugger("langwatch:studio:socket");

let socketInstance: WebSocket | null = null;
let pythonDisconnectedTimeout: NodeJS.Timeout | null = null;
let instances = 0;
let lastIsAliveCallTimestamp = 0;

export const useSocketClient = () => {
  instances++;
  const instanceId = instances;

  const { project } = useOrganizationTeamProject();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    socketStatus,
    setSocketStatus,
    setComponentExecutionState,
    setWorkflowExecutionState,
    setEvaluationState,
    setOptimizationState,
    getWorkflow,
    setSelectedNode,
    setPropertiesExpanded,
    setOpenResultsPanelRequest,
    playgroundOpen,
  } = useWorkflowStore((state) => ({
    socketStatus: state.socketStatus,
    setSocketStatus: state.setSocketStatus,
    setComponentExecutionState: state.setComponentExecutionState,
    setWorkflowExecutionState: state.setWorkflowExecutionState,
    setEvaluationState: state.setEvaluationState,
    setOptimizationState: state.setOptimizationState,
    getWorkflow: state.getWorkflow,
    setSelectedNode: state.setSelectedNode,
    setPropertiesExpanded: state.setPropertiesExpanded,
    setOpenResultsPanelRequest: state.setOpenResultsPanelRequest,
    playgroundOpen: state.playgroundOpen,
  }));

  const alertOnComponent = useAlertOnComponent();

  const checkIfUnreachableErrorMessage = useCallback(
    (message: string | undefined) => {
      if (
        socketStatus === "connected" &&
        message?.toLowerCase().includes("runtime is unreachable")
      ) {
        setSocketStatus("connecting-python");
      }
    },
    [socketStatus, setSocketStatus]
  );

  const stopWorkflowIfRunning = useCallback(
    (message: string | undefined) => {
      setWorkflowExecutionState({
        status: "error",
        error: message,
        timestamps: { finished_at: Date.now() },
      });
      for (const node of getWorkflow().nodes) {
        if (node.data.execution_state?.status === "running") {
          setComponentExecutionState(node.id, {
            status: "error",
            error: message,
            timestamps: { finished_at: Date.now() },
          });
        }
      }
    },
    [setWorkflowExecutionState, getWorkflow, setComponentExecutionState]
  );

  const alertOnError = useCallback((message: string | undefined) => {
    if (
      !!message?.toLowerCase().includes("stopped") ||
      !!message?.toLowerCase().includes("interrupted")
    ) {
      toaster.create({
        title: "Stopped",
        description: message?.slice(0, 140),
        type: "info",
        meta: {
          closable: true,
        },
        duration: 3000,
      });
    } else {
      toaster.create({
        title: "Error",
        description: message?.slice(0, 140),
        type: "error",
        meta: {
          closable: true,
        },
        duration: 5000,
      });
    }
  }, []);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const data: StudioServerEvent = JSON.parse(event.data);
      debug(data.type, "payload" in data ? data.payload : undefined);

      switch (data.type) {
        case "is_alive_response":
          if (pythonDisconnectedTimeout) {
            clearTimeout(pythonDisconnectedTimeout);
            pythonDisconnectedTimeout = null;
          }
          debug("Python is alive, setting status to connected");
          setSocketStatus("connected");
          break;
        case "component_state_change":
          const currentComponentState = getWorkflow().nodes.find(
            (node) => node.id === data.payload.component_id
          )?.data.execution_state;
          setComponentExecutionState(
            data.payload.component_id,
            data.payload.execution_state
          );

          if (data.payload.execution_state?.status === "error") {
            checkIfUnreachableErrorMessage(data.payload.execution_state.error);
            alertOnComponent({
              componentId: data.payload.component_id,
              execution_state: data.payload.execution_state,
            });
          }

          if (
            !playgroundOpen &&
            data.payload.execution_state?.status !== "running" &&
            currentComponentState?.status !== "success" &&
            ((getWorkflow().state.execution?.status === "running" &&
              getWorkflow().state.execution?.until_node_id ===
                data.payload.component_id) ||
              getWorkflow().state.execution?.status !== "running")
          ) {
            setSelectedNode(data.payload.component_id);
            setPropertiesExpanded(true);
          }
          break;
        case "execution_state_change":
          setWorkflowExecutionState(data.payload.execution_state);
          if (data.payload.execution_state?.status === "error") {
            alertOnError(data.payload.execution_state.error);
            stopWorkflowIfRunning(data.payload.execution_state.error);
          }
          break;
        case "evaluation_state_change":
          const currentEvaluationState = getWorkflow().state.evaluation;
          setEvaluationState(data.payload.evaluation_state);
          if (data.payload.evaluation_state?.status === "error") {
            alertOnError(data.payload.evaluation_state.error);
            if (currentEvaluationState?.status !== "waiting") {
              setTimeout(() => {
                setOpenResultsPanelRequest("evaluations");
              }, 500);
            }
          }
          break;
        case "optimization_state_change":
          const currentOptimizationState = getWorkflow().state.optimization;
          setOptimizationState(data.payload.optimization_state);
          if (data.payload.optimization_state?.status === "error") {
            alertOnError(data.payload.optimization_state.error);
            if (currentOptimizationState?.status !== "waiting") {
              setTimeout(() => {
                setOpenResultsPanelRequest("optimizations");
              }, 500);
            }
          }
          break;
        case "error":
          checkIfUnreachableErrorMessage(data.payload.message);
          stopWorkflowIfRunning(data.payload.message);
          alertOnError(data.payload.message);
          break;
        case "debug":
          break;
        case "done":
          break;
        default:
          toaster.create({
            title: "Unknown message type on client",
            //@ts-expect-error
            description: data.type,
            type: "warning",
            meta: {
              closable: true,
            },
            duration: 5000,
          });
          break;
      }
    },
    [
      setSocketStatus,
      getWorkflow,
      setComponentExecutionState,
      playgroundOpen,
      setWorkflowExecutionState,
      setEvaluationState,
      setOptimizationState,
      checkIfUnreachableErrorMessage,
      stopWorkflowIfRunning,
      alertOnError,
      alertOnComponent,
      setSelectedNode,
      setPropertiesExpanded,
      setOpenResultsPanelRequest,
    ]
  );

  const connect = useCallback(() => {
    if (!project) return;

    if (socketInstance?.readyState === WebSocket.OPEN) return;

    setSocketStatus("connecting-socket");
    socketInstance = new WebSocket(
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${
        window.location.host
      }/api/studio/ws?projectId=${encodeURIComponent(project.id)}`
    );

    socketInstance.onopen = () => {
      debug("Socket opened, connecting to python");
      setSocketStatus((socketStatus) => {
        if (
          socketStatus === "disconnected" ||
          socketStatus === "connecting-socket"
        ) {
          lastIsAliveCallTimestamp = 0;
          return "connecting-python";
        }

        return socketStatus;
      });
    };

    socketInstance.onclose = () => {
      if (socketInstance?.readyState === WebSocket.OPEN) return;
      debug("Socket closed, reconnecting");
      setSocketStatus("disconnected");
      scheduleReconnect();
    };

    socketInstance.onerror = (error) => {
      debug("Socket error, reconnecting");
      console.error("WebSocket error:", error);
      setSocketStatus("disconnected");
      scheduleReconnect();
    };

    socketInstance.onmessage = handleMessage;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, setSocketStatus]);

  const disconnect = useCallback(() => {
    debug("Socket disconnect triggered, closing socket");
    if (socketInstance) {
      socketInstance.close();
      socketInstance = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setSocketStatus("disconnected");
  }, [setSocketStatus]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) return;

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connect();
    }, 5000); // Reconnect after 5 seconds
  }, [connect]);

  const sendMessage = useCallback((event: StudioClientEvent) => {
    if (socketInstance?.readyState === WebSocket.OPEN) {
      socketInstance.send(JSON.stringify(event));
    } else {
      console.error("Cannot send message: WebSocket is not connected");
    }
  }, []);

  useEffect(() => {
    if (instanceId !== instances) return;
    if (socketInstance) {
      socketInstance.onmessage = handleMessage;
    }
  }, [handleMessage, instanceId]);

  useEffect(() => {
    if (instanceId !== instances) return;

    const pythonReconnect = () => {
      pythonDisconnectedTimeout = setTimeout(() => {
        setSocketStatus("connecting-python");
      }, 10_000);
    };

    const isAlive = () => {
      if (instanceId !== instances) return;
      lastIsAliveCallTimestamp = Date.now();
      sendMessage({ type: "is_alive", payload: {} });
      if (socketStatus === "connected" && !pythonDisconnectedTimeout) {
        pythonReconnect();
      }
    };

    const interval = setInterval(
      isAlive,
      socketStatus === "connecting-python" ? 5_000 : 30_000
    );
    // Make the first call
    if (
      socketStatus === "connecting-python" &&
      Date.now() - lastIsAliveCallTimestamp > 5_000
    ) {
      isAlive();
    }

    return () => {
      clearInterval(interval);
    };
  }, [socketStatus, sendMessage, setSocketStatus, instanceId]);

  useEffect(() => {
    return () => {
      instances--;
    };
  }, []);

  return {
    socketStatus,
    sendMessage,
    connect,
    disconnect,
  };
};
