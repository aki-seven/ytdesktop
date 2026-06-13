import { BrowserView, ipcMain } from "electron";
import fs from "fs";
import Conf from "conf";

import IIntegration from "../integration";
import { StoreSchema } from "~shared/store/schema";
import { Unsubscribe } from "conf/dist/source/types";

export default class CustomCSS implements IIntegration {
  private ytView: BrowserView;
  private store: Conf<StoreSchema>;
  private isEnabled = false;
  private hasInjectedOnce = false;

  private customCSSKey: string | null = null;
  private storeListener: Unsubscribe | null = null;
  private ipcListener: () => void | null = null;

  private currentWatcher: fs.FSWatcher | null = null;

  public provide(store: Conf<StoreSchema>, ytView: BrowserView): void {
    let ytViewChanged = false;
    if (ytView !== this.ytView) {
      ytViewChanged = true;
    }

    this.ytView = ytView;
    this.store = store;

    if (ytViewChanged) {
      this.customCSSKey = null;
    }

    if ((this.isEnabled && !this.hasInjectedOnce) || (this.isEnabled && ytViewChanged)) {
      this.enable();
    }
  }

  public enable(): void {
    this.isEnabled = true;
    if (this.ytView === null || this.customCSSKey) return;

    this.injectCSS();

    // Listen to updates to the custom CSS file
    if (this.storeListener) {
      this.storeListener();
      this.storeListener = null;
    }
    this.storeListener = this.store.onDidChange("appearance", (oldState, newState) => {
      if (newState.customCSSEnabled && oldState.customCSSPath != newState.customCSSPath) {
        this.updateCSS();
      }
    });
  }

  public disable(): void {
    this.removeCSS();
    this.isEnabled = false;
    this.hasInjectedOnce = false;

    if (this.currentWatcher) {
      this.currentWatcher.close();
      this.currentWatcher = null;
    }

    if (this.storeListener) {
      this.storeListener();
      this.storeListener = null;
    }

    if (this.ipcListener) {
      ipcMain.removeListener("ytView:loaded", this.ipcListener);
      this.ipcListener = null;
    }
  }

  public getYTScripts(): { name: string; script: string }[] {
    return [];
  }

  public updateCSS(): void {
    if (this.isEnabled) {
      this.removeCSS();
      this.injectCSS();
    }
  }

  // --------------------------------------------------

  private injectCSS() {
    if (!this.ytView) {
      return;
    }
    this.hasInjectedOnce = true;

    const cssPath: string | null = this.store.get("appearance.customCSSPath");
    if (cssPath && fs.existsSync(cssPath)) {
      const content: string = fs.readFileSync(cssPath, "utf8");

      /* To do in the future...
        Have an alternative means of checking if ytView has loaded
        as I'd rather keep away from constantly having an event for if `ytView:loaded` is emitted
        and only needed for the initial load of the app */
      if (this.ipcListener) {
        ipcMain.removeListener("ytView:loaded", this.ipcListener);
      }
      this.ipcListener = () => {
        this.ytView.webContents.insertCSS(content).then(customCssRef => {
          this.customCSSKey = customCssRef;
        });
      };
      ipcMain.once("ytView:loaded", this.ipcListener);

      this.ytView.webContents.insertCSS(content).then(customCssRef => {
        this.refitYTPopups();
        this.customCSSKey = customCssRef;
      });

      this.watchCSSFile(cssPath);
    }
  }

  private async removeCSS() {
    if (this.customCSSKey === null || !this.ytView) return;

    await this.ytView.webContents.removeInsertedCSS(this.customCSSKey);
    this.customCSSKey = null;
    this.refitYTPopups();
  }

  private async watchCSSFile(newFile?: string) {
    // Reset the file listener if it exists
    if (this.currentWatcher) {
      this.currentWatcher.close();
      this.currentWatcher = null;
    }

    if (newFile === null) return;

    // Watch for changes to the custom CSS file
    // and update the CSS when it changes
    this.currentWatcher = fs.watch(newFile, {}, (type, filename) => {
      if (type === "change") {
        this.updateCSS();
      } else if (type === "rename") {
        if (filename) {
          this.store.set("appearance.customCSSPath", null);
          this.removeCSS();
          this.currentWatcher.close();
        }
      }
    });
  }

  private async refitYTPopups() {
    if (this.ytView) {
      this.ytView.webContents.send("ytView:refitPopups");
    }
  }
}
