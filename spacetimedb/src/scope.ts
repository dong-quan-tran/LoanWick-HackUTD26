import type { Application, InvestigationJob, ReadableDb, RevisionVector } from './schema'

export function matchesRevisions(actual: RevisionVector, expected: RevisionVector) {
  return actual.applicationRevision === expected.applicationRevision &&
    actual.collateralRevision === expected.collateralRevision && actual.paymentRevision === expected.paymentRevision
}

function confirmedNeighbors(store: ReadableDb, applicationId: string) {
  const candidates = [
    ...store.matchCandidates.leftApplicationId.filter(applicationId),
    ...store.matchCandidates.rightApplicationId.filter(applicationId),
  ]
  return candidates.filter(edge => edge.decision === 'confirmed_same_entity' || edge.decision === 'confirmed_related')
}

export function relatedSources(store: ReadableDb, application: Application) {
  const ids = new Set<string>()
  for (const claim of store.collateral.applicationId.filter(application.id)) {
    if (!claim.active) continue
    for (const match of store.collateral.normalizedIdentifier.filter(claim.normalizedIdentifier)) {
      const source = match.active && store.applications.id.find(match.applicationId)
      if (source && source.organizationId === application.organizationId) ids.add(source.id)
    }
  }
  const group = new Set([application.id])
  for (const member of group) {
    for (const edge of confirmedNeighbors(store, member)) {
      const source = store.applications.id.find(edge.leftApplicationId === member ? edge.rightApplicationId : edge.leftApplicationId)
      if (source?.organizationId === application.organizationId) group.add(source.id)
    }
    if (group.size > 64) break
  }
  for (const id of group) ids.add(id)
  ids.delete(application.id)
  return [...ids].sort()
}

export function sourcesMatch(store: ReadableDb, application: Application, snapshot: Pick<InvestigationJob, 'revisions' | 'sources'>) {
  if (!matchesRevisions(application, snapshot.revisions)) return false
  const sourceIds = relatedSources(store, application)
  return sourceIds.length === snapshot.sources.length && snapshot.sources.every((source, index) => {
    const current = store.applications.id.find(source.applicationId)
    return sourceIds[index] === source.applicationId && current && matchesRevisions(current, source.revisions)
  })
}

export function jobCollateral(store: ReadableDb, applicationId: string, sourceId: string) {
  const claims = Array.from(store.collateral.applicationId.filter(sourceId)).filter(claim => claim.active)
  if (applicationId === sourceId) return claims
  const identifiers = new Set(Array.from(store.collateral.applicationId.filter(applicationId))
    .filter(claim => claim.active).map(claim => claim.normalizedIdentifier))
  return claims.filter(claim => identifiers.has(claim.normalizedIdentifier))
}

export function jobEvidence(store: ReadableDb, applicationId: string, sourceId: string, scope: ReadonlySet<string>) {
  const candidates = Array.from(store.evidence.applicationId.filter(sourceId))
    .filter(item => store.documents.id.find(item.documentId)?.current)
  if (applicationId === sourceId) return candidates
  const ids = new Set(jobCollateral(store, applicationId, sourceId).flatMap(claim => claim.evidenceIds))
  for (const edge of confirmedNeighbors(store, sourceId)) {
    const isLeft = edge.leftApplicationId === sourceId
    if (!scope.has(isLeft ? edge.rightApplicationId : edge.leftApplicationId)) continue
    const entity = store.entityRecords.id.find(isLeft ? edge.leftEntityId : edge.rightEntityId)
    for (const evidenceId of entity?.evidenceIds ?? []) ids.add(evidenceId)
  }
  return candidates.filter(item => ids.has(item.id))
}

export function verifiesOwnershipConflict(
  store: ReadableDb, applicationIds: string[], evidenceIds: string[], historical = false,
) {
  if (applicationIds.length < 2) return false
  const cited = new Set(evidenceIds)
  const claimsByCase = applicationIds.map(applicationId =>
    Array.from(store.collateral.applicationId.filter(applicationId))
      .filter(claim => (historical || claim.active) && claim.exclusiveOwnershipClaim &&
        claim.evidenceIds.some(id => {
          if (!cited.has(id)) return false
          const evidence = store.evidence.id.find(id)
          const document = evidence && store.documents.id.find(evidence.documentId)
          return evidence?.applicationId === applicationId && document?.type === 'collateral_schedule' &&
            (historical || document.current) && document.version === evidence.documentVersion &&
            ((['identifier', 'equipment_identifier'].includes(evidence.fieldName ?? '') &&
              [claim.identifier, claim.normalizedIdentifier].includes(evidence.fieldValue ?? '')) ||
              (evidence.fieldName === 'exclusiveOwnershipClaim' && evidence.fieldValue === 'true'))
        }))
      .map(claim => claim.normalizedIdentifier))
  return claimsByCase[0].some(id => claimsByCase.every(claims => claims.includes(id)))
}
