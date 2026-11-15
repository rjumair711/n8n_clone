import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/trpc/client";

// Folders and tags of the Workflows page

export const useWorkflowFolders = () => {
  const trpc = useTRPC();
  return useQuery(trpc.workflowFolders.list.queryOptions());
};

/** Every folder or tag change refreshes the lists and the workflows. */
const useRefresh = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: trpc.workflowFolders.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.workflows.getMany.queryKey() });
  };
};

const onError = (error: { message: string }) => toast.error(error.message);

export const useCreateFolder = () => {
  const trpc = useTRPC();
  const refresh = useRefresh();
  return useMutation(trpc.workflowFolders.createFolder.mutationOptions({
    onSuccess: (folder) => { toast.success(`Folder "${folder.name}" created`); refresh(); },
    onError,
  }));
};

export const useRenameFolder = () => {
  const trpc = useTRPC();
  const refresh = useRefresh();
  return useMutation(trpc.workflowFolders.renameFolder.mutationOptions({
    onSuccess: (folder) => { toast.success(`Renamed to "${folder.name}"`); refresh(); },
    onError,
  }));
};

export const useDeleteFolder = () => {
  const trpc = useTRPC();
  const refresh = useRefresh();
  return useMutation(trpc.workflowFolders.deleteFolder.mutationOptions({
    onSuccess: () => { toast.success("Folder deleted; its workflows are kept"); refresh(); },
    onError,
  }));
};

export const useMoveWorkflow = () => {
  const trpc = useTRPC();
  const refresh = useRefresh();
  return useMutation(trpc.workflowFolders.moveWorkflow.mutationOptions({
    onSuccess: () => refresh(),
    onError,
  }));
};

export const useSetWorkflowTags = () => {
  const trpc = useTRPC();
  const refresh = useRefresh();
  return useMutation(trpc.workflowFolders.setTags.mutationOptions({
    onSuccess: () => { toast.success("Tags saved"); refresh(); },
    onError,
  }));
};

export const useDeleteTag = () => {
  const trpc = useTRPC();
  const refresh = useRefresh();
  return useMutation(trpc.workflowFolders.deleteTag.mutationOptions({
    onSuccess: () => { toast.success("Tag deleted"); refresh(); },
    onError,
  }));
};
