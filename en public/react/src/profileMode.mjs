export function profileModeFromSearch(search) {
  const mode = new URLSearchParams(search).get("mode");
  return { viewOnly: mode === "view", editMode: mode === "edit" };
}
