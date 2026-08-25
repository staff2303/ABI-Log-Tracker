# ABI Log Mapping Pack — Codex Handoff

## 분석 범위

아래 디코딩 로그 7개를 전부 스캔해서 만들었습니다.

- 2026.08.19-18.10.09.log.txt (229,472,365 bytes)
- 2026.08.20-23.18.35.txt (178,647,997 bytes)
- 2026.08.22-17.55.40.txt (216,978,134 bytes)
- 2026.08.23-19.17.48.txt (276,076,307 bytes)
- 2026.08.24-17.02.48.txt (23,590,274 bytes)
- 2026.08.24-17.07.49.txt (12,326,015 bytes)
- 2026.08.24-18.08.48.txt (83,470,522 bytes)

총 원문 텍스트 크기: 1,020,561,614 bytes

## 결과

- 직접 근거가 있는 ID → 표시명 매핑: **113개**
- Map ID → Map Name: **2개**
- ID가 Blueprint 클래스명 자체에 포함된 raw Blueprint hint: **234개**
- 직접 매핑 충돌: **0개**

카테고리별 직접 매핑:

- ammo: 3
- attachment: 43
- equipment: 42
- medical: 4
- provision: 1
- throwable: 3
- treatment: 1
- weapon: 16

## 신뢰 기준

`weaponMap.ts`, `ammoMap.ts`, `equipmentMap.ts` 등에 들어간 값은 추측으로 만든 값이 아닙니다.

다음 직접 로그 근거만 사용했습니다.

1. 같은 로그 줄에서 `ID [ Display Name ]`이 직접 출력된 경우
2. BattleResult에서 `武器Id` 바로 뒤에 `武器名称`이 출력된 경우
3. Map은 `FindMapId:<raw-name>-<id>`가 직접 출력된 경우

`blueprintHints.json`은 별도입니다. Blueprint 클래스명에 ID가 직접 포함되어 있다는 사실만 수집했으며,
사용자 화면의 표시명으로 자동 사용하면 안 됩니다.

## 중요한 미매핑 예

현재 로그에서 아래 ID는 많이 등장하지만 직접 표시명을 찾지 못했으므로 이 팩에 억지로 넣지 않았습니다.

- weaponId `101040005`
- DeathCauserId / ammoId `202060002`

이런 값은 UI에서 기존 ID fallback을 유지해야 합니다.

## Codex 적용 지침

1. 이 폴더의 `.ts` 파일들을 프로젝트의 `src/data/generated/` 같은 위치에 복사합니다.
2. 기존 수동 매핑과 충돌한다면 자동 덮어쓰기하지 말고 evidence를 보고합니다.
3. ID는 항상 `string`으로 취급합니다.
4. 이름이 없으면 추측하지 말고 `Unknown ... #ID` 또는 기존 `—` fallback을 사용합니다.
5. Death Report:
   - `weaponId` → `weaponMap`
   - `DeathCauserId`가 탄약 ID 계열이면 → `ammoMap`
   - `armorId` → `equipmentMap`
6. Kill Detail:
   - `weaponId` → `weaponMap`
   - `armorId` → `equipmentMap`
7. Incoming Damage:
   - `deathCauserId` → `ammoMap`
   - `armorId` → `equipmentMap`
8. 원본 ID는 매핑 후에도 데이터 모델에서 절대 버리지 않습니다.

예:

```ts
const weaponName = weaponMap[kill.weaponId ?? ""] ?? null;
const label = weaponName ?? `Unknown Weapon #${kill.weaponId}`;
```

## 권장 표시

매핑 성공:

```text
AK12
Weapon ID 101010023
```

매핑 실패:

```text
Unknown Weapon
Weapon ID 101040005
```

ID를 `101,040,005`처럼 숫자 포맷하지 않습니다.

## 파일 설명

- `weaponMap.ts` — 총기
- `throwableMap.ts` — 수류탄/투척물
- `attachmentMap.ts` — 총기 부착물
- `ammoMap.ts` — 탄약
- `equipmentMap.ts` — 방어구/리그/가방/헬멧/헤드셋 등
- `consumableMap.ts` — 의료/음식/기타 소비계열
- `otherItemMap.ts` — 기타 직접 이름이 확인된 아이템
- `mapMap.ts` — 맵 ID
- `itemNameResolver.ts` — 통합 resolver
- `mappingEvidence.json` — 각 매핑의 횟수, 소스 로그, 실제 증거 샘플
- `blueprintHints.json` — 표시명으로 쓰지 않는 raw Blueprint 힌트
- `CODEX_TASK.md` — Codex에게 그대로 전달할 작업 지시
