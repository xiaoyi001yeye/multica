import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { projectKeys } from "./queries";
import type {
  CreateProjectResourceRequest,
  ListProjectResourcesResponse,
  ProjectResource,
  UpdateProjectResourceRequest,
} from "../types";
import { resourcePositionSwap } from "./resources";

export const projectResourceKeys = {
  list: (wsId: string, projectId: string) =>
    [...projectKeys.detail(wsId, projectId), "resources"] as const,
};

export function projectResourcesOptions(wsId: string, projectId: string) {
  return queryOptions({
    queryKey: projectResourceKeys.list(wsId, projectId),
    queryFn: () => api.listProjectResources(projectId),
    select: (data) => data.resources,
  });
}

export function useCreateProjectResource(wsId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectResourceRequest) =>
      api.createProjectResource(projectId, data),
    onSuccess: (created) => {
      qc.setQueryData<ListProjectResourcesResponse>(
        projectResourceKeys.list(wsId, projectId),
        (old) =>
          old && !old.resources.some((r) => r.id === created.id)
            ? {
                ...old,
                resources: [...old.resources, created],
                total: old.total + 1,
              }
            : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: projectResourceKeys.list(wsId, projectId),
      });
    },
  });
}

export function useUpdateProjectResource(wsId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      resourceId,
      data,
    }: {
      resourceId: string;
      data: UpdateProjectResourceRequest;
    }) => api.updateProjectResource(projectId, resourceId, data),
    onSuccess: (updated) => {
      qc.setQueryData<ListProjectResourcesResponse>(
        projectResourceKeys.list(wsId, projectId),
        (old) =>
          old
            ? {
                ...old,
                resources: old.resources.map((r) =>
                  r.id === updated.id ? updated : r,
                ),
              }
            : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: projectResourceKeys.list(wsId, projectId),
      });
    },
  });
}

export function useDeleteProjectResource(wsId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) =>
      api.deleteProjectResource(projectId, resourceId),
    onMutate: async (resourceId) => {
      await qc.cancelQueries({
        queryKey: projectResourceKeys.list(wsId, projectId),
      });
      const prev = qc.getQueryData<ListProjectResourcesResponse>(
        projectResourceKeys.list(wsId, projectId),
      );
      qc.setQueryData<ListProjectResourcesResponse>(
        projectResourceKeys.list(wsId, projectId),
        (old) =>
          old
            ? {
                ...old,
                resources: old.resources.filter(
                  (r: ProjectResource) => r.id !== resourceId,
                ),
                total: old.total - 1,
              }
            : old,
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(projectResourceKeys.list(wsId, projectId), ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({
        queryKey: projectResourceKeys.list(wsId, projectId),
      });
    },
  });
}

export function useMoveProjectResource(wsId: string, projectId: string) {
  const qc = useQueryClient();
  const queryKey = projectResourceKeys.list(wsId, projectId);
  return useMutation({
    mutationFn: async ({
      resourceId,
      direction,
    }: {
      resourceId: string;
      direction: "up" | "down";
    }) => {
      const current = qc.getQueryData<ListProjectResourcesResponse>(queryKey);
      const updates = resourcePositionSwap(
        current?.resources ?? [],
        resourceId,
        direction,
      );
      if (current && updates.length > 0) {
        const positions = new Map(
          updates.map((update) => [update.resourceId, update.position]),
        );
        qc.setQueryData<ListProjectResourcesResponse>(queryKey, {
          ...current,
          resources: current.resources
            .map((resource) => ({
              ...resource,
              position: positions.get(resource.id) ?? resource.position,
            }))
            .toSorted(
              (a, b) =>
                a.position - b.position ||
                a.created_at.localeCompare(b.created_at),
            ),
        });
      }

	  const originalPositions = new Map(
		(current?.resources ?? []).map((resource) => [resource.id, resource.position]),
	  );
	  const completed: typeof updates = [];
      try {
		// Apply sequentially so a partial failure is observable and can be
		// compensated. Promise.all could leave one server row updated while the
		// client merely rolled its cache back.
		for (const update of updates) {
		  await api.updateProjectResource(projectId, update.resourceId, {
			position: update.position,
		  });
		  completed.push(update);
		}
        return updates;
      } catch (error) {
		for (const update of completed.toReversed()) {
		  const original = originalPositions.get(update.resourceId);
		  if (original === undefined) continue;
		  try {
			await api.updateProjectResource(projectId, update.resourceId, {
			  position: original,
			});
		  } catch {
			// onSettled invalidates the query; retain the original error while
			// ensuring the next render reflects authoritative server state.
		  }
		}
        if (current) qc.setQueryData(queryKey, current);
        throw error;
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });
}
