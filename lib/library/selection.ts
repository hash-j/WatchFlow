export function toggleLibrarySelection(
  selectedIds: ReadonlySet<string>,
  libraryId: string,
) {
  const next = new Set(selectedIds);
  if (next.has(libraryId)) next.delete(libraryId);
  else next.add(libraryId);
  return next;
}

export function selectVisibleLibraryIds(visibleIds: readonly string[]) {
  return new Set(visibleIds);
}

export function orderedSelectedLibraryIds(
  visibleIds: readonly string[],
  selectedIds: ReadonlySet<string>,
) {
  return visibleIds.filter((libraryId) => selectedIds.has(libraryId));
}

export function getPageSelectionState(
  visibleIds: readonly string[],
  selectedIds: ReadonlySet<string>,
) {
  const selectedCount = orderedSelectedLibraryIds(
    visibleIds,
    selectedIds,
  ).length;

  return {
    selectedCount,
    checked: visibleIds.length > 0 && selectedCount === visibleIds.length,
    indeterminate: selectedCount > 0 && selectedCount < visibleIds.length,
  };
}

