"use strict";

(function profilePage() {
  const detailsForm = document.querySelector("#profile-details-form");
  if (!detailsForm) return;

  const fields = document.querySelector("#profile-details-fields");
  const changeButton = document.querySelector("#change-details");
  const saveButton = document.querySelector("#save-details");
  const detailsStatus = document.querySelector("#profile-details-status");
  const photoInput = document.querySelector("#profile-photo");
  const photoPreview = document.querySelector("#profile-photo-preview");
  const photoStatus = document.querySelector("#profile-status");
  const writeRequests = window.chamaWriteRequests?.createWriteRequester();

  function showStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
  }

  async function readJson(response) {
    let body;
    try { body = await response.json(); } catch { body = {}; }
    if (response.status === 401) {
      window.location.assign("/");
      throw new Error("Your session has expired. Sign in again to edit your profile.");
    }
    if (!response.ok) throw new Error(body.message || `Request failed (${response.status}).`);
    return body;
  }

  async function loadProfile() {
    const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store" });
    const body = await readJson(response);
    if (!body.data) throw new Error("The server did not return profile details.");
    for (const name of ["firstName", "lastName", "nickname", "phone", "email"]) {
      detailsForm.elements.namedItem(name).value = body.data[name] || "";
    }
  }

  changeButton.addEventListener("click", () => {
    fields.disabled = false;
    saveButton.hidden = false;
    changeButton.hidden = true;
    detailsForm.elements.namedItem("firstName").focus();
  });

  detailsForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!detailsForm.reportValidity()) return;
    saveButton.disabled = true;
    showStatus(detailsStatus, "Saving profile details…");
    const body = Object.fromEntries(new FormData(detailsForm).entries());
    try {
      const result = await writeRequests.submit({
        owner: detailsForm,
        path: "/api/profile",
        method: "PUT",
        body,
        validate: response => !!response.data,
      });
      for (const name of ["firstName", "lastName", "nickname", "phone", "email"]) {
        detailsForm.elements.namedItem(name).value = result.data[name] || "";
      }
      fields.disabled = true;
      saveButton.hidden = true;
      changeButton.hidden = false;
      showStatus(detailsStatus, result.message || "Profile details saved.");
    } catch (error) {
      showStatus(detailsStatus, error.message, true);
    } finally {
      saveButton.disabled = false;
    }
  });

  async function createPng(file, size) {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("This browser cannot prepare the profile photo.");
      const scale = Math.min(size / bitmap.width, size / bitmap.height);
      const width = bitmap.width * scale;
      const height = bitmap.height * scale;
      context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
      return await new Promise((resolve, reject) => canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not convert the selected image."));
      }, "image/png"));
    } finally {
      bitmap.close?.();
    }
  }

  function idempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  }

  async function uploadPhoto(file) {
    if (!file || file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
    showStatus(photoStatus, "Preparing profile icons…");
    const sizes = [32, 180, 192, 512];
    for (const size of sizes) {
      const png = await createPng(file, size);
      const response = await fetch(`/api/profile/photo/${size}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "image/png",
          "X-Requested-With": "chama",
          "Idempotency-Key": idempotencyKey(),
        },
        body: png,
      });
      await readJson(response);
      showStatus(photoStatus, `Uploading profile icons… ${sizes.indexOf(size) + 1}/${sizes.length}`);
    }
    photoPreview.replaceChildren();
    const image = document.createElement("img");
    image.alt = "Current profile photo";
    image.src = `/api/profile/photo/180?refresh=${Date.now()}`;
    photoPreview.append(image);
    showStatus(photoStatus, "Profile photo saved.");
  }

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    photoInput.disabled = true;
    try { await uploadPhoto(file); }
    catch (error) { showStatus(photoStatus, error.message, true); }
    finally { photoInput.disabled = false; photoInput.value = ""; }
  });

  const currentPhoto = document.createElement("img");
  currentPhoto.alt = "Current profile photo";
  currentPhoto.src = "/api/profile/photo/180";
  currentPhoto.addEventListener("load", () => photoPreview.replaceChildren(currentPhoto), { once: true });

  loadProfile().catch(error => showStatus(detailsStatus, error.message, true));
})();
