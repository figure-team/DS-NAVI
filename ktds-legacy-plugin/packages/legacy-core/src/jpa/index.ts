/**
 * JPA / Spring Data 추출(보완 B) 공개 표면.
 */
export {
  JPA_MODEL_FILENAME,
  JpaModelSchema,
  JpaEntitySchema,
  JpaRepositorySchema,
  JpaColumnSchema,
  JpaRelationSchema,
  JpaDerivedQuerySchema,
  JpaQuerySchema,
} from './types.js'
export type {
  JpaModel,
  JpaEntity,
  JpaRepository,
  JpaColumn,
  JpaRelation,
  JpaDerivedQuery,
  JpaQuery,
} from './types.js'
export {
  extractJpaModel,
  extractJpaFromSource,
  parseDerivedQuery,
  snakeCase,
} from './extract.js'
