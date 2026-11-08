import {
  FilePlusIcon,
  FileTextIcon,
  GlobeIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
  PencilIcon,
  SearchIcon,
  SquareTerminalIcon,
  WrenchIcon,
} from "lucide-react";
import type { Category } from "../model/build-chat";

export const CATEGORY_ICONS: Record<Category, typeof WrenchIcon> = {
  read: FileTextIcon,
  search: SearchIcon,
  write: FilePlusIcon,
  edit: PencilIcon,
  commands: SquareTerminalIcon,
  webFetch: GlobeIcon,
  plan: ListChecksIcon,
  questions: MessageCircleQuestionIcon,
  tools: WrenchIcon,
};
