import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertCircle, CheckCircle, Info as InfoIcon, Terminal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const meta: Meta<typeof Alert> = {
  title: "UI/Alert",
  component: Alert,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert className="w-96">
      <Terminal className="h-4 w-4" />
      <AlertTitle>Session started</AlertTitle>
      <AlertDescription>
        Forge is running on port 3000. Open the web UI to begin your session.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-96">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Build failed</AlertTitle>
      <AlertDescription>
        TypeScript errors in <code>src/features/chat/model/projection.ts</code>. Run{" "}
        <code>npm run build</code> to see details.
      </AlertDescription>
    </Alert>
  ),
};

export const InfoAlert: Story = {
  name: "Info",
  render: () => (
    <Alert className="w-96">
      <InfoIcon className="h-4 w-4" />
      <AlertTitle>Branch protection active</AlertTitle>
      <AlertDescription>
        Direct pushes to <code>main</code> are blocked. Open a PR to merge your changes.
      </AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert className="w-96">
      <CheckCircle className="h-4 w-4" />
      <AlertTitle>All checks passed</AlertTitle>
      <AlertDescription>
        722 unit tests passed · build succeeded · Biome lint clean.
      </AlertDescription>
    </Alert>
  ),
};
