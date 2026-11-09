import type { Meta, StoryObj } from "@storybook/react-vite";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const meta: Meta<typeof RadioGroup> = {
  title: "UI/RadioGroup",
  component: RadioGroup,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="sonnet">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="sonnet" id="sonnet" />
        <Label htmlFor="sonnet">Claude Sonnet 4.6</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="opus" id="opus" />
        <Label htmlFor="opus">Claude Opus 5.5</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="haiku" id="haiku" />
        <Label htmlFor="haiku">Claude Haiku 5.5</Label>
      </div>
    </RadioGroup>
  ),
};

export const MergeStrategy: Story = {
  render: () => (
    <RadioGroup defaultValue="squash">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="squash" id="squash" />
        <Label htmlFor="squash">Squash and merge</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="rebase" id="rebase" />
        <Label htmlFor="rebase">Rebase and merge</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="merge" id="merge" />
        <Label htmlFor="merge">Merge commit</Label>
      </div>
    </RadioGroup>
  ),
};
