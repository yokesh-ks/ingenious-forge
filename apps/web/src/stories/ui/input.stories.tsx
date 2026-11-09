import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: "Session name…" },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-2">
      <Label htmlFor="branch">Branch name</Label>
      <Input id="branch" placeholder="feat/my-feature-42" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { placeholder: "Read-only", disabled: true },
};

export const WithValue: Story = {
  args: { defaultValue: "chore/storybook-web-ui-161" },
};

export const Search: Story = {
  args: { type: "search", placeholder: "Search sessions…" },
};

export const Password: Story = {
  args: { type: "password", placeholder: "API key" },
};
