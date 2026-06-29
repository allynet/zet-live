import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";

import { FieldError, FormField } from "@/components/form-fields";
import { Button, Input } from "@/components/ui";
import { type UserDetail } from "@/entity/schemas";
import { useUpdateUser } from "@/lib/queries";

export function UserEditForm({ user }: { user: UserDetail }) {
  const update = useUpdateUser(user.id);
  const form = useForm({
    defaultValues: {
      displayName: user.displayName ?? "",
      email: user.email ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        await update.mutateAsync(value);
        toast.success("User updated");
      } catch (e) {
        toast.error(`Failed: ${e instanceof Error ? e.message : ""}`);
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-3"
    >
      <form.Field name="displayName" validators={{ onChange: z.string().min(1, "Required") }}>
        {(field) => (
          <FormField label="Display name" error={<FieldError errors={field.state.meta.errors} />}>
            <Input
              value={field.state.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onBlur={() => {
                field.handleBlur();
              }}
            />
          </FormField>
        )}
      </form.Field>
      <form.Field
        name="email"
        validators={{ onChange: z.string().email("Invalid email").or(z.literal("")) }}
      >
        {(field) => (
          <FormField label="Email" error={<FieldError errors={field.state.meta.errors} />}>
            <Input
              type="email"
              value={field.state.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onBlur={() => {
                field.handleBlur();
              }}
            />
          </FormField>
        )}
      </form.Field>
      <div>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
