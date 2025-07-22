import { PUBLIC_SITE_URL } from "astro:env/client";

const trimUrl = (url: string) => url.trim().replaceAll(/\/*$/g, "");

// @ts-ignore: Vite defines __DATE__
export const BUILD_DATE = new Date(__DATE__);

export const SITE_TITLE = "ZET Live";

export const SITE_DESCRIPTION =
  "Trenutni položaj i red vožnje svih javno dostupnih ZET vozila prikazan uživo";

export const SITE_URL = trimUrl(PUBLIC_SITE_URL || import.meta.env.SITE);

export const links = {
  github: {
    href: "https://github.com/Allypost",
    text: "GitHub",
    icon: "simple-icons:github",
  },
  signal: {
    href: "https://signal.me/#eu/ufFtvrezLyxsTqGR8_1wUZk_TZKqdBzz3HdNpOimROglOzpWSt1DCoRZke_MdT4M",
    text: "Signal",
    icon: "simple-icons:signal",
  },
  mastodon: {
    href: "https://mastodon.social/@allypost",
    text: "Mastodon",
    icon: "simple-icons:mastodon",
    handle: "@Allypost@mastodon.social",
  },
  bluesky: {
    href: "https://bsky.app/profile/allypost.net",
    text: "Bluesky",
    icon: "simple-icons:bluesky",
  },
  linkedin: {
    href: "https://www.linkedin.com/in/josip-igrec/",
    text: "LinkedIn",
    icon: "simple-icons:linkedin",
  },
} as const;
