# Codex 작업: ABI ID 매핑 데이터 적용

첨부한 ABI mapping pack을 기존 프로젝트에 적용해라.

## 원칙

- 기존 정상 동작하는 Streaming Decoder / Raid Parser / Kill dedup / Death resolution은 변경하지 않는다.
- 매핑은 UI 표시 계층에 연결하되 원본 ID는 계속 보존한다.
- mapping pack에 없는 ID의 이름을 추측하지 않는다.
- ID는 `number`가 아니라 `string`으로 취급한다.
- ID에 `toLocaleString()` 또는 천 단위 쉼표 포맷을 적용하지 않는다.

## 적용 대상

### Kill Detail
- `weaponId` → `weaponMap`
- `armorId` → `equipmentMap`

매핑된 경우 이름을 우선 표시하고, Expanded Detail에는 raw ID를 계속 표시한다.

매핑되지 않은 경우:
- `Unknown Weapon`
- `Weapon ID 101040005`

### Death Detail
- `weaponId` → `weaponMap`
- `DeathCauserId` / ammoId → `ammoMap`
- `armorId` → `equipmentMap`

DeathCauserId가 ammoMap에 없으면 raw ID를 그대로 유지하고 이름은 `—` 또는 `Unknown Ammo`.

### Incoming Damage
- `deathCauserId` → `ammoMap`
- `armorId` → `equipmentMap`

### Map
- mapId → `mapMap`

## 충돌 처리

프로젝트에 기존 수동 매핑이 있다면 자동 덮어쓰기하지 마라.

동일 ID에 다른 이름이 존재하면:
1. 기존 값
2. mapping pack 값
3. `mappingEvidence.json`의 evidence
를 비교하고 conflict로 보고한다.

## 테스트

다음 항목의 테스트를 추가한다.

- 알려진 ID가 이름으로 변환됨
- 알려지지 않은 ID가 fallback으로 표시됨
- 원본 ID가 계속 보존됨
- ID에 comma가 삽입되지 않음
- mapping 적용 전후 Raid/Kill/Death count가 동일함

최소 검증 예:

- `101010023` → `AK12`
- `101010014` → `AEK Assault Rifle`
- `101010002` → `M4A1 Assault Rifle`
- `101020003` → `P90 Micro SMG`
- `202030004` → `5.56x45 M995`
- `202080006` → `5.7×28 SS198`
- `202170001` → `5.8×42 DVC12`
- `1601` → `TV Station`
- `1102` → `Farm`

미매핑 검증:

- `101040005`는 현재 mapping pack에서 억지로 이름을 만들지 않는다.
- `202060002`도 현재 직접 이름 근거가 없으므로 억지 매핑하지 않는다.

## 완료 후 보고

1. 적용된 총 매핑 수
2. 카테고리별 적용 수
3. 기존 프로젝트 매핑과 충돌한 ID
4. 여전히 미매핑인 Kill weaponId 목록
5. 여전히 미매핑인 Death weaponId 목록
6. 여전히 미매핑인 DeathCauserId 목록
7. 여전히 미매핑인 armorId 목록
8. 수정 파일 목록
9. lint / typecheck / test / build 결과
10. 실제 ABInfinite.log regression 결과

매핑 적용 때문에 Raid count, Kill count, Death resolution 결과가 변하면 안 된다.
