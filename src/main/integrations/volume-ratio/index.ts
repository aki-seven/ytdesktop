import { BrowserView } from "electron";
import IIntegration from "../integration";

import enableScript from "./script/enable.script?raw";
import disableScript from "./script/disable.script?raw";
import forceUpdateVolume from "./script/forceupdatevolume.script?raw";

export default class VolumeRatio implements IIntegration {
  // This integration is based upon the following GreasyFork script:
  // https://greasyfork.org/en/scripts/397686-youtube-music-fix-volume-ratio
  // Made by: Marco Pfeiffer <git@marco.zone>

  private ytView: BrowserView;
  private hasInjected = false;
  private isEnabled = false;
  private waitForYTView = true;

  public provide(ytView: BrowserView): void {
    if (ytView !== this.ytView) {
      // The YTM view object has changed from what we knew it was. Invalidate the state as the YTM view was recreated
      this.hasInjected = false;
      this.waitForYTView = true;
    }
    this.ytView = ytView;

    if (this.isEnabled && !this.hasInjected) {
      this.enable();
    }
  }

  public enable(): void {
    this.isEnabled = true;
    if ((this.isEnabled && this.hasInjected) || this.waitForYTView || this.ytView === null) return;

    this.ytView.webContents.send("ytView:executeScript", "ratioVolume", "enable");

    this.forceUpdateVolume();

    this.hasInjected = true;
  }

  public disable(): void {
    this.isEnabled = false;
    if (!this.hasInjected) return;

    this.ytView.webContents.send("ytView:executeScript", "ratioVolume", "disable");

    this.forceUpdateVolume();
    this.hasInjected = false;
  }

  public getYTScripts(): { name: string; script: string }[] {
    return [
      {
        name: "enable",
        script: enableScript
      },
      {
        name: "disable",
        script: disableScript
      },
      {
        name: "forceUpdateVolume",
        script: forceUpdateVolume
      }
    ];
  }

  private forceUpdateVolume(): void {
    this.ytView.webContents.send("ytView:executeScript", "ratioVolume", "forceUpdateVolume");
  }

  public ytViewLoaded(): void {
    this.waitForYTView = false;
    if (this.isEnabled) this.enable();
  }
}
