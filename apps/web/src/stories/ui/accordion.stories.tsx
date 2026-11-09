import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const meta: Meta<typeof Accordion> = {
  title: "UI/Accordion",
  component: Accordion,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Accordion>;

export const Default: Story = {
  render: () => (
    <Accordion type="single" collapsible className="w-80">
      <AccordionItem value="item-1">
        <AccordionTrigger>What is Forge Agent?</AccordionTrigger>
        <AccordionContent>
          Forge Agent is a web-native coding harness that lets you run AI agents inside your
          browser.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>How do sessions work?</AccordionTrigger>
        <AccordionContent>
          Each session spins up an isolated workspace with its own git checkout, terminal, and agent
          context.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Can I run multiple agents at once?</AccordionTrigger>
        <AccordionContent>
          Yes. Use parallel worktrees and claim different issues in the project board to avoid file
          collisions.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const Multiple: Story = {
  render: () => (
    <Accordion type="multiple" className="w-80">
      <AccordionItem value="item-1">
        <AccordionTrigger>Session configuration</AccordionTrigger>
        <AccordionContent>
          Set the model, context limit and tool permissions before starting a session.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Git integration</AccordionTrigger>
        <AccordionContent>
          Forge auto-creates a branch per story and enforces conventional commit messages.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
