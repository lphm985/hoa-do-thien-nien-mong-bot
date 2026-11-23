import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ButtonInteraction, Message } from "discord.js";

export type CommandMeta = {
  name: string;        // Từ khóa chính không kèm dấu ! (vd: "pray", "bag", "trade")
  aliases?: string[];  // Các tên gọi phụ nếu có (vd: ["inv"])
  command: string;     // Cú pháp hiển thị trong !help (vd: "!bag [@user]")
  description: string; // Mô tả hiển thị trong !help
};

export type LoadedCommand = {
  meta: CommandMeta;
  execute: (message: Message) => Promise<void>;
  buttonPrefixes?: string[];
  handleButton?: (interaction: ButtonInteraction) => Promise<void>;
};

let cachedCommands: LoadedCommand[] | null = null;

export async function getAllCommands(forceReload = false): Promise<LoadedCommand[]> {
  if (cachedCommands && !forceReload) {
    return cachedCommands;
  }

  const commandsDir = path.resolve(process.cwd(), "commands");
  const files = fs
    .readdirSync(commandsDir)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

  const loaded: LoadedCommand[] = [];

  for (const file of files) {
    try {
      const fullPath = path.join(commandsDir, file);
      const mod = await import(pathToFileURL(fullPath).href);

      if (mod?.commandInfo?.name && typeof mod?.execute === "function") {
        loaded.push({
          meta: {
            name: String(mod.commandInfo.name).toLowerCase().replace(/^!/, ""),
            aliases: Array.isArray(mod.commandInfo.aliases)
              ? mod.commandInfo.aliases.map((a: string) =>
                  String(a).toLowerCase().replace(/^!/, "")
                )
              : [],
            command: String(mod.commandInfo.command ?? `!${mod.commandInfo.name}`),
            description: String(mod.commandInfo.description ?? ""),
          },
          execute: mod.execute,
          buttonPrefixes: Array.isArray(mod.buttonPrefixes)
            ? mod.buttonPrefixes
            : undefined,
          handleButton:
            typeof mod.handleButton === "function" ? mod.handleButton : undefined,
        });
      }
    } catch (err) {
      console.error(`Lỗi nạp file lệnh ${file}:`, err);
    }
  }

  // Tự động sắp xếp A -> Z theo cú pháp lệnh
  loaded.sort((a, b) =>
    a.meta.command.localeCompare(b.meta.command, "vi", { sensitivity: "base" })
  );

  cachedCommands = loaded;
  return loaded;
}
