import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const meta: Meta<typeof Carousel> = {
  title: "UI/Carousel",
  component: Carousel,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Carousel>;

const sessions = [
  { branch: "feat/chat-ui", status: "Active", commits: 3 },
  { branch: "feat/storybook-161", status: "In Progress", commits: 7 },
  { branch: "fix/api-types", status: "Done", commits: 1 },
  { branch: "docs/adr-0016", status: "Paused", commits: 2 },
];

export const Default: Story = {
  render: () => (
    <div className="w-72">
      <Carousel>
        <CarouselContent>
          {sessions.map((s) => (
            <CarouselItem key={s.branch}>
              <Card>
                <CardContent className="flex aspect-square flex-col items-center justify-center gap-2 p-6">
                  <p className="font-mono text-sm font-medium">{s.branch}</p>
                  <p className="text-muted-foreground text-xs">{s.status}</p>
                  <p className="text-xs">{s.commits} commits</p>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
};

export const MultipleVisible: Story = {
  render: () => (
    <div className="w-96">
      <Carousel opts={{ align: "start" }}>
        <CarouselContent className="-ml-2">
          {sessions.map((s) => (
            <CarouselItem key={s.branch} className="pl-2 basis-1/2">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="font-mono text-xs">{s.branch.split("/")[1]}</p>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
    </div>
  ),
};
