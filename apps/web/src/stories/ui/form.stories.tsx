import type { Meta, StoryObj } from "@storybook/react-vite";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const meta: Meta = {
  title: "UI/Form",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

const schema = z.object({
  branch: z
    .string()
    .min(3, "Branch name must be at least 3 characters")
    .regex(/^[a-z]+\/[a-z0-9-]+-\d+$/, "Use format type/name-N (e.g. feat/chat-ui-45)"),
  model: z.string().min(1, "Select a model"),
});

function SessionForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { branch: "", model: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => {})} className="w-80 space-y-5">
        <FormField
          control={form.control}
          name="branch"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Branch name</FormLabel>
              <FormControl>
                <Input placeholder="feat/my-feature-42" {...field} />
              </FormControl>
              <FormDescription>Format: type/kebab-name-issueN</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="model"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="claude-sonnet-4-6">Claude Sonnet 4.6</SelectItem>
                  <SelectItem value="claude-opus-5-5">Claude Opus 5.5</SelectItem>
                  <SelectItem value="claude-haiku-5-5">Claude Haiku 5.5</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full">
          Start session
        </Button>
      </form>
    </Form>
  );
}

export const Default: Story = {
  render: () => <SessionForm />,
};
