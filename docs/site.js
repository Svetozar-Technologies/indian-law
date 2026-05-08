const supported = [...document.querySelectorAll("[data-language]")].map((node) => node.dataset.language);
const preferred = navigator.languages?.map((value) => value.split("-")[0]).find((code) => supported.includes(code)) || "en";
document.documentElement.dataset.preferredLanguage = preferred;
const preferredLink = document.querySelector("#preferred-language-link");
if (preferredLink) preferredLink.href = `laws/${preferred}/index.html`;
