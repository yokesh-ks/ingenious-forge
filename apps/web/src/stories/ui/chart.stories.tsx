import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { ChartConfig } from "@/components/ui/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const meta: Meta = {
  title: "UI/Chart",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

const commitData = [
  { day: "Mon", commits: 2 },
  { day: "Tue", commits: 5 },
  { day: "Wed", commits: 3 },
  { day: "Thu", commits: 7 },
  { day: "Fri", commits: 4 },
  { day: "Sat", commits: 1 },
  { day: "Sun", commits: 0 },
];

const barConfig: ChartConfig = {
  commits: { label: "Commits", color: "hsl(var(--chart-1))" },
};

export const BarChartStory: Story = {
  name: "Bar chart",
  render: () => (
    <ChartContainer config={barConfig} className="w-80 h-48">
      <BarChart data={commitData}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="commits" fill="var(--color-commits)" radius={4} />
      </BarChart>
    </ChartContainer>
  ),
};

const sessionData = [
  { hour: "09", active: 1 },
  { hour: "10", active: 3 },
  { hour: "11", active: 5 },
  { hour: "12", active: 4 },
  { hour: "13", active: 2 },
  { hour: "14", active: 6 },
  { hour: "15", active: 8 },
];

const lineConfig: ChartConfig = {
  active: { label: "Active sessions", color: "hsl(var(--chart-2))" },
};

export const LineChartStory: Story = {
  name: "Line chart",
  render: () => (
    <ChartContainer config={lineConfig} className="w-80 h-48">
      <LineChart data={sessionData}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="hour" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          type="monotone"
          dataKey="active"
          stroke="var(--color-active)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  ),
};
