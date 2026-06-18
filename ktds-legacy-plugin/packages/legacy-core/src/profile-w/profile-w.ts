/**
 * Profile-W schema freeze (P4.6 / AC-25) — supplement-A(change-impact) 출력 스키마 동결.
 *
 * 이 파일은 SCHEMA 만 정의한다(AIDD 구현 없음, 채우는 엔진 없음). supplement A 의
 * 변경영향 산출물 형태를 Profile-W change-story 호환 shape 로 동결해, P5.5(supplement A)가
 * **이 shape 의 객체를 생산**하게 한다(AIDD 연동은 의도적으로 연기/deferred).
 *
 * zod 스키마 + z.infer 타입으로 손편집/버전 스큐를 조용히 통과시키지 않는다.
 * 모든 필드는 Profile W change-story 의 필드로 1:1 매핑된다(아래 주석 참조).
 */
import { z } from 'zod'

/** 근거 인용 — file + line(라인 미상이면 null). doc-generator Evidence 와 동일 규약. */
export const SourceCitationSchema = z.object({
  file: z.string(),
  line: z.number().int().nullable(),
})
export type SourceCitation = z.infer<typeof SourceCitationSchema>

/**
 * change-story 의 단일 task — Profile W task 항목에 매핑.
 * id(안정 식별자) + description(작업 설명) + 선택적 fileList(작업이 건드릴 파일).
 */
export const ProfileWTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  fileList: z.array(z.string()).optional(),
})
export type ProfileWTask = z.infer<typeof ProfileWTaskSchema>

/**
 * Profile-W change-story 호환 출력 스키마(AC-25, SCHEMA ONLY).
 *
 * Profile W change-story 매핑:
 *  - storyId            -> change-story 식별자
 *  - title              -> change-story 제목
 *  - acceptanceCriteria -> 수용 기준(AC) 목록
 *  - tasks              -> 작업 분해(task) 목록
 *  - sourceCitations    -> 근거 인용(file:line) — grounding 보존
 *  - fileList           -> 변경 영향 파일 목록
 *
 * 주(AC-25): P5.5(supplement A)가 이 shape 의 객체를 **생산(PRODUCE)**한다.
 * AIDD 연동(이 스키마로부터 실제 AIDD 작업 생성)은 의도적으로 연기(DEFERRED)되었다 —
 * 이 파일은 채우는 엔진/AIDD 구현을 포함하지 않는다.
 */
export const ProfileWChangeStorySchema = z.object({
  storyId: z.string(),
  title: z.string(),
  acceptanceCriteria: z.array(z.string()),
  tasks: z.array(ProfileWTaskSchema),
  sourceCitations: z.array(SourceCitationSchema),
  fileList: z.array(z.string()),
})
export type ProfileWChangeStory = z.infer<typeof ProfileWChangeStorySchema>
