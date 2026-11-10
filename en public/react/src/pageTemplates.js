import dashboard from "../../index.html?raw";

export const pageTemplates = Object.freeze({
  dashboard,
});

export function pageForPath(pathname) {
  if (pathname === "/member-login.html") return "memberLogin";
  if (pathname === "/register.html") return "register";
  if (pathname === "/profile.html") return "profile";
  return "dashboard";
}
