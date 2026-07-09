/** 클래스/인터페이스/열거/레코드 종류. */
export type ClassKind = 'class' | 'interface' | 'enum' | 'record';
/** 필드 팩트. */
export interface FieldFact {
    name: string;
    /** 타입의 외곽 식별자(제네릭/배열/패키지 제거). */
    type: string;
    line: number;
    annotations: string[];
}
/**
 * 호출 수신자(receiver) 기술자 — 메서드 호출의 수신 표현식을 재귀 형태로 표현한다.
 * P3 method-call 해소가 8-receiver 종류를 판정하는 입력이다.
 *   - this        : `this.m()` / 묵시적 self (receiver 가 `this`)
 *   - super       : `super.m()`
 *   - name        : 단일 식별자 receiver (`svc`, `p`, `x`, `Foo`) — field/param/local/static 후보
 *   - call        : 체이닝 호출 receiver (`a.b()` 의 `b()` 부분) — 반환 타입 추론으로 해소
 *   - field       : 필드 접근 receiver (`a.b` 의 `b` 부분) — 필드 타입 추론으로 해소
 *   - unknown     : 명시 수신자가 있으나 형태를 따라갈 수 없음(캐스트/람다/배열접근/생성식/
 *                   삼항 등) — unresolved 로 해소돼야 한다. null(묵시적 self)과 구별하기 위함:
 *                   null=수신자 없음(self), unknown=수신자 있으나 미해소(절대 self 로 오인 금지).
 */
export type ReceiverDesc = {
    kind: 'this';
} | {
    kind: 'super';
} | {
    kind: 'name';
    text: string;
} | {
    kind: 'call';
    on: ReceiverDesc | null;
    methodName: string;
} | {
    kind: 'field';
    on: ReceiverDesc | null;
    field: string;
} | {
    kind: 'unknown';
};
/** 메서드 본문 내 단일 호출 지점(소스 순서 보존). */
export interface CallSite {
    /** 호출되는 메서드 이름. */
    methodName: string;
    /** 호출 인자 개수(오버로드 arity 매칭에 사용). */
    argCount: number;
    /** 수신자 기술자. receiver 없는 묵시적 self 호출은 null. */
    receiver: ReceiverDesc | null;
    /** receiver 의 소스 텍스트(없으면 null). */
    receiverText: string | null;
    /** 1-based 호출 라인. */
    line: number;
    /** 호출 노드의 바이트 시작 오프셋(지역변수 선언-사용 순서 판정용). */
    startIndex: number;
}
/** 메서드 본문 내 지역변수 선언(선언-사용 순서로 가장 가까운 선언을 고르기 위함). */
export interface JavaLocalVar {
    name: string;
    /** 선언 타입의 외곽 식별자. `var` 는 그대로 'var'(추론 불가 표식). */
    typeName: string;
    /** 선언 노드의 바이트 시작 오프셋. */
    startIndex: number;
}
/** 메서드(또는 생성자) 선언 팩트. */
export interface MethodFact {
    name: string;
    /** 파라미터 개수(오버로드 arity 키). */
    paramCount: number;
    /** formal_parameters 의 소스 텍스트(파라미터 타입/이름 파싱용). */
    paramsText: string;
    /** 반환 타입의 외곽 식별자(없거나 void/기본형이면 null). */
    returnType: string | null;
    /** 1-based 선언 라인. */
    line: number;
    /** 메서드/생성자 선언 어노테이션(이름만, 예 `PreAuthorize`). 정책 신호(권한) 입력. */
    annotations: string[];
    /** 메서드 본문 지역변수 선언(선언 순서). */
    locals: JavaLocalVar[];
    /** 메서드 본문 내 호출 지점(소스 순서). */
    calls: CallSite[];
}
/** 클래스(또는 인터페이스/열거/레코드) 팩트. */
export interface ClassFact {
    name: string;
    /** packageName 이 있으면 `${packageName}.${name}`, 없으면 name. */
    fqn: string;
    kind: ClassKind;
    isAbstract: boolean;
    /** 상속 대상의 외곽 식별자 목록(클래스는 0~1, 인터페이스는 다수 가능). */
    extends: string[];
    /** 구현 인터페이스의 외곽 식별자 목록. */
    implements: string[];
    line: number;
    fields: FieldFact[];
    /** 모든 생성자 파라미터 타입의 외곽 식별자(선언 순서). */
    ctorParamTypes: string[];
    annotations: string[];
    /** 메서드 선언(선언 순서) — P3 method-call 해소 입력(추가 필드, 기존 소비자 무영향). */
    methods: MethodFact[];
}
/** 한 Java 파일의 팩트. */
export interface JavaFileFacts {
    relPath: string;
    packageName: string | null;
    /** import 문 FQN 목록(정적/와일드카드 포함, 선언 순서). */
    imports: string[];
    classes: ClassFact[];
}
/** 한 Java 파일에서 팩트를 추출한다(파일당 1회 파싱). */
export declare function extractJavaFacts(relPath: string, src: string): Promise<JavaFileFacts>;
//# sourceMappingURL=java-facts.d.ts.map