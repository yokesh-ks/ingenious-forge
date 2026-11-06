import { describe, expect, it } from "vitest";
import { matchSlashCommands, SLASH_COMMANDS } from "../slash-commands";

describe("matchSlashCommands", () => {
  it("lists every command for a bare slash", () => {
    expect(matchSlashCommands("/")).toEqual(SLASH_COMMANDS);
  });

  it("matches commands by prefix, ignoring case", () => {
    expect(matchSlashCommands("/IN").map((c) => c.name)).toEqual(["init"]);
  });

  it("still matches a command typed in full", () => {
    expect(matchSlashCommands("/init").map((c) => c.name)).toEqual(["init"]);
  });

  it("matches nothing once arguments follow the command", () => {
    expect(matchSlashCommands("/init focus on tests")).toEqual([]);
  });

  it("matches nothing for text that does not start with a slash", () => {
    expect(matchSlashCommands("init")).toEqual([]);
    expect(matchSlashCommands("please /init")).toEqual([]);
    expect(matchSlashCommands("")).toEqual([]);
  });

  it("matches nothing for an unknown command", () => {
    expect(matchSlashCommands("/xyz")).toEqual([]);
  });
});
