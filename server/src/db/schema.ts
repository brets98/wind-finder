import { Schema, type SchemaDefinition } from 'mongoose';

/**
 * Base for every collection: MongoDB's `_id` plus automatic `createdAt` and
 * `updatedAt` (last change time). JSON output exposes `id` instead of `_id`/`__v`.
 */
export function createSchema<T>(definition: SchemaDefinition<T>) {
  return new Schema<T>(definition, {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret._id;
        return ret;
      },
    },
  });
}
