import { Box, Text, useDisclosure } from "@chakra-ui/react";
import { type Node, type NodeProps } from "@xyflow/react";
import { forwardRef, useEffect, useState, type Ref } from "react";
import { DatasetPreview } from "../../../components/datasets/DatasetPreview";
import { useGetDatasetData } from "../../hooks/useGetDatasetData";
import { type Component, type Entry } from "../../types/dsl";
import { DatasetModal } from "../DatasetModal";
import { ComponentNode, NodeSectionTitle } from "./Nodes";

export const EntryNode = forwardRef(function EntryNode(
  props: NodeProps<Node<Component>>,
  ref: Ref<HTMLDivElement>
) {
  const [rendered, setRendered] = useState(false);
  const { open, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    setRendered(true);
  }, []);

  const { rows, columns, total } = useGetDatasetData({
    dataset: (props.data as Entry).dataset,
    preview: true,
  });

  return (
    <ComponentNode ref={ref} {...props} outputsTitle="Fields" hidePlayButton>
      <NodeSectionTitle>
        Dataset{" "}
        {total && (
          <Text as="span" color="gray.400">
            ({total} rows)
          </Text>
        )}
      </NodeSectionTitle>
      <Box
        width="200%"
        transform="scale(0.5)"
        transformOrigin="top left"
        height={`${(34 + 28 * (rows?.length ?? 0)) / 2}px`}
      >
        {rendered && (
          <DatasetPreview
            rows={rows}
            columns={columns.map((column) => ({
              name: column.name,
              type: "string",
            }))}
            onClick={onOpen}
          />
        )}
      </Box>
      <DatasetModal
        open={open}
        editingDataset={(props.data as Entry).dataset}
        onClose={onClose}
        node={props}
      />
    </ComponentNode>
  );
});
