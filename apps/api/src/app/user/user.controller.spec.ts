import { permissions } from '@ghostfolio/common/permissions';
import type { ImpersonationContext } from '@ghostfolio/common/types';

import { UserController } from './user.controller';

describe('UserController', () => {
  const impersonationContext = { isActive: false } as ImpersonationContext;

  let updateUserSetting: jest.Mock;
  let userController: UserController;

  beforeEach(() => {
    updateUserSetting = jest.fn().mockResolvedValue({});

    userController = new UserController(
      null,
      null,
      null,
      null,
      {
        user: {
          id: 'user-id',
          permissions: [permissions.updateUserSettings],
          role: 'USER',
          settings: { settings: {} }
        }
      } as any,
      { updateUserSetting } as any
    );
  });

  describe('updateUserSetting', () => {
    it('emits the portfolio changed event when the base currency changes', async () => {
      await userController.updateUserSetting(
        { baseCurrency: 'CHF' },
        impersonationContext
      );

      expect(updateUserSetting).toHaveBeenCalledWith(
        expect.objectContaining({ emitPortfolioChangedEvent: true })
      );
    });

    it('emits the portfolio changed event when experimental features are turned on', async () => {
      await userController.updateUserSetting(
        { isExperimentalFeatures: true },
        impersonationContext
      );

      expect(updateUserSetting).toHaveBeenCalledWith(
        expect.objectContaining({ emitPortfolioChangedEvent: true })
      );
    });

    it('emits the portfolio changed event when experimental features are turned off', async () => {
      await userController.updateUserSetting(
        { isExperimentalFeatures: false },
        impersonationContext
      );

      expect(updateUserSetting).toHaveBeenCalledWith(
        expect.objectContaining({ emitPortfolioChangedEvent: true })
      );
    });

    it('does not emit the portfolio changed event for unrelated settings', async () => {
      await userController.updateUserSetting(
        { colorScheme: 'DARK' },
        impersonationContext
      );

      expect(updateUserSetting).toHaveBeenCalledWith(
        expect.objectContaining({ emitPortfolioChangedEvent: false })
      );
    });
  });
});
