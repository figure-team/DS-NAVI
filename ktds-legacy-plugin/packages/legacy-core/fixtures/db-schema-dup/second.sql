-- 중복 CREATE diff 픽스처 — 둘째 파일(중복 정의, 첫 정의 유지 대상).

-- t_order: 첫 파일과 구조 동일(대소문자·공백만 다름) → info 강등 기대.
create table t_order (
  order_id int not null primary key,
  amount decimal(10, 2) not null,
  status varchar(10)
);

-- t_pay: method 타입 상이 + approved_at 컬럼 추가 → warn + diff 요약 기대.
create table t_pay (
  pay_id int not null primary key,
  method varchar(20),
  approved_at timestamp
);
