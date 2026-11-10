import dashboard from "../../index.html?raw";
import memberLogin from "../../member-login.html?raw";
import profile from "../../profile.html?raw";

export const pageTemplates = Object.freeze({
  dashboard,
  memberLogin,
  profile,
});

export function pageForPath(pathname) {
  if (pathname === "/member-login.html") return "memberLogin";
  if (pathname === "/register.html") return "register";
  if (pathname === "/profile.html") return "profile";
  return "dashboard";
}
