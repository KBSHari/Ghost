import { SubscriptionType } from '@ghostfolio/common/enums';
import { permissions } from '@ghostfolio/common/permissions';
import { Provider, Role } from '@ghostfolio/prisma/enums';

import { UserService } from './user.service';

describe('UserService', () => {
  let configurationService: { get: jest.Mock };
  let prismaService: { user: { findUnique: jest.Mock } };
  let propertyService: { getByKey: jest.Mock };
  let subscriptionService: { getSubscription: jest.Mock };
  let userService: UserService;

  function mockUser({
    isExperimentalFeatures,
    role
  }: {
    isExperimentalFeatures: boolean;
    role: Role;
  }) {
    prismaService.user.findUnique.mockResolvedValue({
      role,
      _count: { activities: 0 },
      accessToken: null,
      accounts: [],
      analytics: null,
      authChallenge: null,
      createdAt: new Date('2020-01-01'),
      id: 'user-1',
      provider: Provider.GOOGLE,
      settings: {
        settings: { isExperimentalFeatures },
        updatedAt: new Date('2020-01-01'),
        userId: 'user-1'
      },
      subscriptions: [],
      thirdPartyId: null,
      updatedAt: new Date('2020-01-01')
    });
  }

  function mockSubscriptionFeature(aSubscriptionType?: SubscriptionType) {
    configurationService.get.mockImplementation((aKey: string) => {
      return aKey === 'ENABLE_FEATURE_SUBSCRIPTION'
        ? aSubscriptionType !== undefined
        : false;
    });

    subscriptionService.getSubscription.mockReturnValue({
      offer: {
        coupon: 1,
        couponId: 'coupon',
        durationExtension: '1 month',
        label: 'Label'
      },
      type: aSubscriptionType
    });
  }

  beforeEach(() => {
    configurationService = { get: jest.fn().mockReturnValue(false) };
    prismaService = { user: { findUnique: jest.fn() } };
    propertyService = { getByKey: jest.fn().mockResolvedValue(undefined) };
    subscriptionService = { getSubscription: jest.fn() };

    userService = new UserService(
      undefined,
      configurationService as never,
      undefined,
      undefined,
      prismaService as never,
      propertyService as never,
      subscriptionService as never,
      undefined,
      undefined
    );
  });

  describe('rebalancing permissions', () => {
    const writePermissions = [
      permissions.createRebalancingModel,
      permissions.deleteRebalancingModel,
      permissions.updateRebalancingModel
    ];

    it('are granted to a user with experimental features enabled', async () => {
      mockUser({ isExperimentalFeatures: true, role: Role.USER });

      const user = await userService.user({ id: 'user-1' });

      expect(user.permissions).toContain(permissions.accessRebalancing);

      for (const permission of writePermissions) {
        expect(user.permissions).toContain(permission);
      }
    });

    it('keep access but lose the write permissions in read-only mode', async () => {
      mockUser({ isExperimentalFeatures: true, role: Role.USER });
      configurationService.get.mockImplementation((aKey: string) => {
        return aKey === 'ENABLE_FEATURE_READ_ONLY_MODE';
      });
      propertyService.getByKey.mockResolvedValue(true);

      const user = await userService.user({ id: 'user-1' });

      expect(user.permissions).toContain(permissions.accessRebalancing);

      for (const permission of writePermissions) {
        expect(user.permissions).not.toContain(permission);
      }
    });

    it('is granted to an admin with experimental features enabled', async () => {
      mockUser({ isExperimentalFeatures: true, role: Role.ADMIN });

      const user = await userService.user({ id: 'user-1' });

      expect(user.permissions).toContain(permissions.accessRebalancing);
    });

    it('are withheld when experimental features are disabled', async () => {
      mockUser({ isExperimentalFeatures: false, role: Role.USER });

      const user = await userService.user({ id: 'user-1' });

      expect(user.permissions).not.toContain(permissions.accessRebalancing);

      for (const permission of writePermissions) {
        expect(user.permissions).not.toContain(permission);
      }
    });

    it('are withheld from the demo user', async () => {
      mockUser({ isExperimentalFeatures: true, role: Role.DEMO });

      const user = await userService.user({ id: 'user-1' });

      expect(user.permissions).not.toContain(permissions.accessRebalancing);

      for (const permission of writePermissions) {
        expect(user.permissions).not.toContain(permission);
      }
    });

    it('is granted with a basic subscription', async () => {
      mockUser({ isExperimentalFeatures: true, role: Role.USER });
      mockSubscriptionFeature(SubscriptionType.Basic);

      const user = await userService.user({ id: 'user-1' });

      expect(user.permissions).toContain(permissions.accessRebalancing);
    });

    it('is granted with a premium subscription', async () => {
      mockUser({ isExperimentalFeatures: true, role: Role.USER });
      mockSubscriptionFeature(SubscriptionType.Premium);

      const user = await userService.user({ id: 'user-1' });

      expect(user.permissions).toContain(permissions.accessRebalancing);
    });

    it('is withheld with a basic subscription when experimental features are disabled', async () => {
      mockUser({ isExperimentalFeatures: false, role: Role.USER });
      mockSubscriptionFeature(SubscriptionType.Basic);

      const user = await userService.user({ id: 'user-1' });

      expect(user.permissions).not.toContain(permissions.accessRebalancing);
    });
  });
});
