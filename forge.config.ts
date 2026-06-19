import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import * as fs from "fs";
import * as path from "path";
// There is probably a better way to do this, such as fetching it directly from forge
let makerArch = null;
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--arch") {
    makerArch = process.argv[i + 1];
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    executableName: "youtube-desktop-app",
    icon: "./src/assets/icons/ytd",
    extraResource: [
      "./src/assets/icons/tray.ico",
      "./src/assets/icons/trayTemplate.png",
      "./src/assets/icons/trayTemplate@2x.png",
      "./src/assets/icons/ytd.png",
      "./src/assets/icons/ytd_white.png",
      "./src/assets/icons/ytd_black.png",

      "./src/assets/icons/controls/pause-button.png",
      "./src/assets/icons/controls/play-button.png",
      "./src/assets/icons/controls/play-next-button.png",
      "./src/assets/icons/controls/play-previous-button.png"
    ],
    protocols: [
      {
        name: "YouTube Desktop App",
        schemes: ["ytd"]
      }
    ],
    appCategoryType: "public.app-category.video",

    asar: true,
    asarUnpack: ["node_modules/@ghostery/**"],
    packageAfterCopy: async (_forgeConfig, _buildPath) => {
      const projectRoot = process.cwd();
      const modules = [
        {
          src: path.join(projectRoot, "node_modules", "@ghostery", "adblocker-electron-preload"),
          dest: path.join(_buildPath, "node_modules", "@ghostery", "adblocker-electron-preload")
        },
        {
          src: path.join(projectRoot, "node_modules", "@ghostery", "adblocker-content"),
          dest: path.join(_buildPath, "node_modules", "@ghostery", "adblocker-content")
        }
      ];

      for (const mod of modules) {
        if (fs.existsSync(mod.src)) {
          fs.mkdirSync(path.dirname(mod.dest), { recursive: true });
          fs.cpSync(mod.src, mod.dest, { recursive: true });
        }
      }
    }
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      iconUrl: `https://raw.githubusercontent.com/aki-seven/ytdesktop/main/src/assets/icons/ytd.ico`,
      setupIcon: "./src/assets/icons/ytd.ico"
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({
      options: {
        categories: ["AudioVideo", "Video"],
        mimeType: ["x-scheme-handler/ytd"],
        icon: "./src/assets/icons/ytd.png"
      }
    }),
    new MakerDeb({
      options: {
        categories: ["AudioVideo", "Video"],
        mimeType: ["x-scheme-handler/ytd"],
        section: "web",
        icon: "./src/assets/icons/ytd.png"
      }
    })
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        authToken: process.env.GITHUB_TOKEN,
        repository: {
          owner: process.env.YTD_UPDATE_FEED_OWNER ?? "aki-seven",
          name: process.env.YTD_UPDATE_FEED_REPOSITORY ?? "ytdesktop"
        }
      }
    }
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/index.ts",
          config: "viteconfig/main.ts",
          target: "main"
        },
        // TODO: Utilize a single config for preload so we can share chunks if needed
        {
          entry: "src/renderer/windows/main/preload.ts",
          config: "viteconfig/preload/main_window.ts",
          target: "preload"
        },
        {
          entry: "src/renderer/windows/settings/preload.ts",
          config: "viteconfig/preload/settings_window.ts",
          target: "preload"
        },
        {
          entry: "src/renderer/windows/authorize-companion/preload.ts",
          config: "viteconfig/preload/authorize_companion_window.ts",
          target: "preload"
        },
        {
          entry: "src/renderer/ytview/preload.ts",
          config: "viteconfig/preload/ytview.ts",
          target: "preload"
        }
      ],
      renderer: [
        // Instead of opting for defining each window as a separate object we bundle them all together and have a more custom output to share chunks
        {
          name: "all_windows",
          config: "viteconfig/renderer.ts"
        }
      ]
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      resetAdHocDarwinSignature: process.platform === "darwin" && makerArch == "arm64",
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};

export default config;
