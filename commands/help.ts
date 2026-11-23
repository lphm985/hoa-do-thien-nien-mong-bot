
import type { Message } from "discord.js";

type HelpEntry = {
  command: string;
  description: string;
};

// Khai báo mọi lệnh ở đây (hiện tại và sau này) — hệ thống sẽ tự sắp xếp theo bảng chữ cái
export const HELP_ENTRIES: HelpEntry[] = [
  {
    command: "!curse @user",
    description: "Nguyền rủa người được tag và trừ điểm ngẫu nhiên.",
  },
  {
    command: "!help",
    description: "Xem danh sách các lệnh hiện có (sắp xếp theo bảng chữ cái).",
  },
  {
    command: "!pray",
    description: "Cầu nguyện ngẫu nhiên lời thoại, cộng hoặc trừ điểm cá nhân.",
  },
  {
    command: "!stats [@user]",
    description: "Xem bảng thông tin, ảnh đại diện và tổng điểm của bản thân hoặc người khác.",
  },
  { command: "!bag [@user]", description: "Mở bảng kho đồ vật phẩm của bản thân.", },
    {
    command: "!give @user <item> [sl]",
    description: "Tặng vật phẩm từ kho của bạn cho người khác.",
  },
  {
    command: "!trade @user <món_bạn> [sl1] <món_họ> [sl2]",
    description: "Đề nghị trao đổi 2 chiều (cần người được tag bấm Đồng ý).",
  },
  
  // Sau này có lệnh mới thì thêm tiếp vào đây, ví dụ:
  // {
  //   command: "!mypray",
  //   description: "Xem điểm cầu nguyện và thời gian hồi chiêu còn lại.",
  // },
  // {
  //   command: "!praytop",
  //   description: "Xem bảng xếp hạng điểm cầu nguyện.",
  // },
];

export async function handleHelpCommand(message: Message): Promise<void> {
  const sorted = [...HELP_ENTRIES].sort((a, b) =>
    a.command.localeCompare(b.command, "vi", { sensitivity: "base" })
  );

  const lines = sorted.map(
    (entry) => `• \`${entry.command}\` — ${entry.description}`
  );

  await message.reply(
    `**Danh sách lệnh của Hoạ Đồ Thiên Niên Mộng (A → Z):**\n${lines.join("\n")}`
  );
}
