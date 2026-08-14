import { describe, expect, it } from 'vitest';
import { defaultFabricVisibility, fabricStatusIsPublic, transitionFabricStatus, validateFabricSubmission } from '@autoserver/community-fabric';

describe('community fabric workflow contracts', () => {
  it('keeps member-care work private by default', () => {
    expect(defaultFabricVisibility('MEMBER_CARE')).toBe('PRIVATE');
    expect(defaultFabricVisibility('PROJECT')).toBe('GUILD');
  });

  it('validates bounded safe submission metadata', () => {
    expect(validateFabricSubmission({ domain:'PROJECT', title:'Docs refresh', summary:'Refresh the onboarding documentation and examples.', metadata:{area:'onboarding'} }).title).toBe('Docs refresh');
    expect(() => validateFabricSubmission({ domain:'CONTENT', title:'Brief', summary:'A sufficiently descriptive content request.', metadata:{apiToken:'secret'} })).toThrow('FABRIC_METADATA_KEY_INVALID');
  });

  it('enforces explicit workflow transitions', () => {
    expect(transitionFabricStatus('OPEN','APPROVED')).toBe('APPROVED');
    expect(transitionFabricStatus('APPROVED','ACTIVE')).toBe('ACTIVE');
    expect(transitionFabricStatus('ACTIVE','COMPLETED')).toBe('COMPLETED');
    expect(() => transitionFabricStatus('COMPLETED','ACTIVE')).toThrow();
  });

  it('publishes only reviewed states', () => {
    expect(fabricStatusIsPublic('OPEN')).toBe(false);
    expect(fabricStatusIsPublic('APPROVED')).toBe(true);
    expect(fabricStatusIsPublic('ACTIVE')).toBe(true);
  });
});
