import {
  Box,
  Divider,
  HStack,
  Spacer,
  Text,
  Tooltip,
  VStack
} from "@chakra-ui/react";
import type { TRPCClientErrorLike } from "@trpc/client";
import type { UseTRPCQueryResult } from "@trpc/react-query/shared";
import type { inferRouterOutputs } from "@trpc/server";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { FormatMoney } from "../../../optimization_studio/components/FormatMoney";
import type { AppRouter } from "../../../server/api/root";
import type { ESBatchEvaluation } from "../../../server/experiments/types";
import { formatMilliseconds } from "../../../utils/formatMilliseconds";
import { formatMoney } from "../../../utils/formatMoney";
import { EvaluationProgressBar } from "./EvaluationProgressBar";

export function BatchEvaluationV2EvaluationSummary({
  run,
  showProgress = false,
}: {
  run: NonNullable<
    UseTRPCQueryResult<
      inferRouterOutputs<AppRouter>["experiments"]["getExperimentBatchEvaluationRuns"],
      TRPCClientErrorLike<AppRouter>
    >["data"]
  >["runs"][number];
  showProgress?: boolean;
}) {
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const finishedAt = useMemo(() => {
    return getFinishedAt(run.timestamps, currentTimestamp);
  }, [run.timestamps, currentTimestamp]);

  const runtime = Math.max(
    run.timestamps.created_at
      ? (finishedAt ?? currentTimestamp) -
          new Date(run.timestamps.created_at).getTime()
      : 0,
    0
  );

  useEffect(() => {
    if (finishedAt) return;

    const interval = setInterval(() => {
      setCurrentTimestamp(new Date().getTime());
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!finishedAt]);

  return (
    <VStack
      width="full"
      background="white"
      spacing={0}
      position="sticky"
      left={0}
      bottom={0}
      borderTop="1px solid"
      borderColor="gray.200"
      overflowX="auto"
    >
      <HStack width="100%" paddingY={4} paddingX={6} spacing={5}>
        {Object.entries(run.summary.evaluations).map(([_, evaluation]) => {
          return (
            <>
              <VStack align="start" spacing={1}>
                <Text fontWeight="500">{evaluation.name}</Text>
                <Text>{formatEvaluationSummary(evaluation)}</Text>
              </VStack>
              <Divider orientation="vertical" height="48px" />
            </>
          );
        })}
        <VStack align="start" spacing={1}>
          <Text fontWeight="500" noOfLines={1}>
            Mean Cost
          </Text>
          <Text noOfLines={1} whiteSpace="nowrap">
            <FormatMoney
              amount={
                (run.summary.dataset_average_cost ?? 0) +
                (run.summary.evaluations_average_cost ?? 0)
              }
              currency="USD"
              format="$0.00[00]"
              tooltip={
                <VStack align="start" spacing={0}>
                  <Text>
                    Prediction mean cost:{" "}
                    {run.summary.dataset_average_cost
                      ? formatMoney(
                          {
                            amount: run.summary.dataset_average_cost,
                            currency: "USD",
                          },
                          "$0.00[00]"
                        )
                      : "-"}
                  </Text>
                  <Text>
                    Evaluation mean cost:{" "}
                    {run.summary.evaluations_average_cost
                      ? formatMoney(
                          {
                            amount: run.summary.evaluations_average_cost,
                            currency: "USD",
                          },
                          "$0.00[00]"
                        )
                      : "-"}
                  </Text>
                </VStack>
              }
            />
          </Text>
        </VStack>
        <Divider orientation="vertical" height="48px" />
        <VStack align="start" spacing={1}>
          <Text fontWeight="500" noOfLines={1}>
            Mean Duration
          </Text>
          <Tooltip
            label={
              <VStack align="start" spacing={0}>
                <Text>
                  Prediction mean duration:{" "}
                  {run.summary.dataset_average_duration
                    ? formatMilliseconds(run.summary.dataset_average_duration)
                    : "-"}
                </Text>
                <Text>
                  Evaluation mean duration:{" "}
                  {run.summary.evaluations_average_duration
                    ? formatMilliseconds(
                        run.summary.evaluations_average_duration
                      )
                    : "-"}
                </Text>
              </VStack>
            }
          >
            <Text>
              {formatMilliseconds(
                (run.summary.dataset_average_duration ?? 0) +
                  (run.summary.evaluations_average_duration ?? 0)
              )}
            </Text>
          </Tooltip>
        </VStack>
        <Divider orientation="vertical" height="48px" />
        <VStack align="start" spacing={1}>
          <Text fontWeight="500" noOfLines={1}>
            Total Cost
          </Text>
          <Text noOfLines={1} whiteSpace="nowrap">
            <FormatMoney
              amount={
                (run.summary.dataset_cost ?? 0) +
                (run.summary.evaluations_cost ?? 0)
              }
              currency="USD"
              format="$0.00[00]"
              tooltip={
                <VStack align="start" spacing={0}>
                  <Text>
                    Prediction cost:{" "}
                    {run.summary.dataset_cost
                      ? formatMoney(
                          {
                            amount: run.summary.dataset_cost,
                            currency: "USD",
                          },
                          "$0.00[00]"
                        )
                      : "-"}
                  </Text>
                  <Text>
                    Evaluation cost:{" "}
                    {run.summary.evaluations_cost
                      ? formatMoney(
                          {
                            amount: run.summary.evaluations_cost,
                            currency: "USD",
                          },
                          "$0.00[00]"
                        )
                      : "-"}
                  </Text>
                </VStack>
              }
            />
          </Text>
        </VStack>
        <Divider orientation="vertical" height="48px" />
        <VStack align="start" spacing={1}>
          <Text fontWeight="500" noOfLines={1}>
            Runtime
          </Text>
          <Text noOfLines={1} whiteSpace="nowrap">
            {numeral(runtime / 1000).format("00:00:00")}
          </Text>
        </VStack>
        {run.timestamps.stopped_at && (
          <>
            <Spacer />
            <HStack>
              <Box
                width="12px"
                height="12px"
                background="red.500"
                borderRadius="full"
              />
              <Text>Stopped</Text>
            </HStack>
          </>
        )}
      </HStack>
      {showProgress && !finishedAt && (
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
            evaluationState={{
              progress: run.progress,
              total: run.total,
            }}
            size="lg"
          />
        </HStack>
      )}
    </VStack>
  );
}

export const getFinishedAt = (
  timestamps: ESBatchEvaluation["timestamps"],
  currentTimestamp: number
) => {
  if (timestamps.finished_at) {
    return timestamps.finished_at;
  }
  if (
    currentTimestamp - new Date(timestamps.updated_at).getTime() >
    2 * 60 * 1000
  ) {
    return new Date(timestamps.updated_at).getTime();
  }
  return undefined;
};

export const formatEvaluationSummary = (
  evaluation: {
    average_score: number;
    average_passed?: number;
  },
  short = false
): string => {
  return evaluation.average_passed !== undefined
    ? numeral(evaluation.average_passed).format("0.[0]%") +
        (short ? " " : " pass") +
        (short || evaluation.average_passed == evaluation.average_score
          ? ""
          : ` (${numeral(evaluation.average_score).format(
              "0.0[0]"
            )} avg. score)`)
    : numeral(evaluation.average_score).format("0.[00]");
};
