import { useForm } from "@tanstack/react-form";
import { z } from "zod";

import { FieldError, FormField } from "@/components/form-fields";
import { type AuthPreset, type ProviderFormValues } from "@/entity/schemas";
import { Button, Input, Select } from "@/components/ui";

export function ProviderForm({
  availablePresets,
  onSubmit,
}: {
  availablePresets: AuthPreset[];
  onSubmit: (values: ProviderFormValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      id: availablePresets[0]?.id ?? "",
      clientId: "",
      clientSecret: "",
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      form.reset();
    },
  });

  if (availablePresets.length === 0) {
    return <p className="text-text-dim text-xs italic">All presets configured.</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-3"
    >
      <form.Field name="id" validators={{ onChange: z.string().min(1, "Select a provider") }}>
        {(field) => (
          <FormField label="Provider" error={<FieldError errors={field.state.meta.errors} />}>
            <Select
              value={field.state.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onBlur={() => {
                field.handleBlur();
              }}
            >
              {availablePresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </form.Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <form.Field name="clientId" validators={{ onChange: z.string().min(1, "Required") }}>
          {(field) => (
            <FormField label="Client ID" error={<FieldError errors={field.state.meta.errors} />}>
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
        <form.Field name="clientSecret" validators={{ onChange: z.string().min(1, "Required") }}>
          {(field) => (
            <FormField
              label="Client Secret"
              error={<FieldError errors={field.state.meta.errors} />}
            >
              <Input
                type="password"
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
      </div>
      <div>
        <Button type="submit">Add provider</Button>
      </div>
    </form>
  );
}
