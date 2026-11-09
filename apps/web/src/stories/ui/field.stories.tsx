import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

const meta: Meta<typeof Field> = {
  title: "UI/Field",
  component: Field,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Field>;

export const Default: Story = {
  render: () => (
    <Field className="w-72">
      <FieldLabel htmlFor="branch">Branch name</FieldLabel>
      <Input id="branch" placeholder="feat/my-feature-42" />
    </Field>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <Field className="w-72">
      <FieldLabel htmlFor="model">Model</FieldLabel>
      <Input id="model" defaultValue="claude-sonnet-4-6" />
      <FieldDescription>The model used for this session. Changing it restarts the context.</FieldDescription>
    </Field>
  ),
};

export const WithError: Story = {
  render: () => (
    <Field className="w-72" data-invalid="true">
      <FieldLabel htmlFor="commits">Commit range</FieldLabel>
      <Input id="commits" defaultValue="main..HEAD~~" />
      <FieldError>Invalid git range. Use HEAD~N or a valid SHA.</FieldError>
    </Field>
  ),
};

export const FormGroup: Story = {
  render: () => (
    <FieldSet className="w-80">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="session-name">Session name</FieldLabel>
          <Input id="session-name" placeholder="feat/my-feature-42" />
        </Field>
        <Field>
          <FieldLabel htmlFor="instructions">Instructions</FieldLabel>
          <Textarea id="instructions" placeholder="Describe the task…" rows={3} />
          <FieldDescription>The agent reads this before starting.</FieldDescription>
        </Field>
      </FieldGroup>
    </FieldSet>
  ),
};
