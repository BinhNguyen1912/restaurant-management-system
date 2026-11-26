import { Furniture, TableStatus } from '@/shared/constants/table.constant'
import z from 'zod'
import { AreaSchema } from './shared-area.model'
import { tableLayoutSchema } from './shared-tableLayout.model'

export const tableNodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  seats: z.number(),
  areaId: z.number(),
  layoutId: z.number().nullable().optional(),
  status: z.enum([
    TableStatus.AVAILABLE,
    TableStatus.OCCUPIED,
    TableStatus.OUT_OF_SERVICE,
    TableStatus.RESERVED,
    TableStatus.HIDE,
  ]),
  token: z.string(),
  /**
   * Phiên bàn do NHÂN VIÊN mở. Phải khai báo ở đây, nếu không `@ZodSerializerDto` sẽ cắt mất
   * (giống bẫy `branch`/`usage` trước đây) và FE luôn thấy "Chưa mở" dù bàn đang mở.
   */
  openedAt: z.date().nullable().optional(),
  openedById: z.number().nullable().optional(),
  type: z.enum([
    Furniture.COUNTER,
    Furniture.DECORATION,
    Furniture.DOOR,
    Furniture.TABLE,
    Furniture.WALL,
    Furniture.ROUND,
    Furniture.SQUARE,
    Furniture.VASE,
  ]),
  //Layout
  positionX: z.number(),
  positionY: z.number(),
  rotation: z.number().nullable(),
  width: z.number(),
  height: z.number(),
  imageUrl: z.string(),

  createdById: z.number().nullable(),
  updatedById: z.number().nullable(),
  deletedById: z.number().nullable(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export const TableNodeResSchema = tableNodeSchema

export const TableNodeDetailResSchema = TableNodeResSchema.extend({
  area: AreaSchema.pick({
    name: true,
  }),
  layout: tableLayoutSchema
    .pick({
      name: true,
      status: true,
    })
    .nullable(),
})
export type TableNodeType = z.infer<typeof tableNodeSchema>
export type TableNodeDetailResType = z.infer<typeof TableNodeDetailResSchema>
export type TableNodeResType = z.infer<typeof TableNodeResSchema>
