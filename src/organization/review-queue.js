export function buildReviewQueue({
  organizationProposals = [],
  irrelevanceFindings = [],
  protectionArchiveProposals = []
} = {}) {
  const items = [...irrelevanceFindings, ...organizationProposals, ...protectionArchiveProposals].sort((left, right) => {
    return left.id.localeCompare(right.id);
  });

  return {
    totals: {
      pendingItems: items.length,
      organizationProposals: organizationProposals.length,
      irrelevanceFindings: irrelevanceFindings.length,
      archiveProposals: protectionArchiveProposals.length,
      destructiveItems: items.filter((item) => item.risk === "destructive").length,
      mutationItems: items.filter((item) => item.risk === "mutation").length
    },
    items
  };
}
