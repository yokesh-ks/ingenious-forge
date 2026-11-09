import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const meta: Meta<typeof Table> = {
  title: "UI/Table",
  component: Table,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Table>;

const sessions = [
  { id: "s-001", branch: "feat/chat-ui", status: "Active", model: "Sonnet 4.6", commits: 3 },
  { id: "s-002", branch: "fix/api-types", status: "Done", model: "Haiku 5.5", commits: 1 },
  { id: "s-003", branch: "chore/storybook", status: "In Progress", model: "Sonnet 4.6", commits: 7 },
];

export const Default: Story = {
  render: () => (
    <Table className="w-[640px]">
      <TableCaption>Recent Forge sessions</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Branch</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">Commits</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-mono text-xs">{s.id}</TableCell>
            <TableCell className="font-mono text-xs">{s.branch}</TableCell>
            <TableCell>
              <Badge
                variant={
                  s.status === "Active"
                    ? "default"
                    : s.status === "Done"
                      ? "secondary"
                      : "outline"
                }
              >
                {s.status}
              </Badge>
            </TableCell>
            <TableCell>{s.model}</TableCell>
            <TableCell className="text-right">{s.commits}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
