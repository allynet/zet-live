import { useForm } from "@tanstack/react-form";

import { FieldError, FormField } from "@/components/form-fields";
import {
  type NoticeCreateValues,
  type NoticeSeverity,
  noticeSeveritySchema,
} from "@/entity/schemas";
import { Button, Select, Textarea } from "@/components/ui";

export function NoticeForm({
  onSubmit,
}: {
  onSubmit: (values: NoticeCreateValues) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      text: "",
      severity: "info" as NoticeSeverity,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      form.reset();
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
      <form.Field name="text" validators={{ onChange: (v) => (v ? undefined : "Required") }}>
        {(field) => (
          <FormField label="Notice text" error={<FieldError errors={field.state.meta.errors} />}>
            <Textarea
              placeholder="Notice text (shown only to this account)…"
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
      <form.Field name="severity">
        {(field) => (
          <FormField label="Severity">
            <Select
              value={field.state.value}
              onChange={(e) => {
                field.handleChange(noticeSeveritySchema.parse(e.target.value));
              }}
              onBlur={() => {
                field.handleBlur();
              }}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </Select>
          </FormField>
        )}
      </form.Field>
      <div>
        <Button type="submit">Add notice</Button>
      </div>
    </form>
  );
}
