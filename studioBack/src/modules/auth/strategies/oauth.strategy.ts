import { Strategy } from 'passport-oauth2';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { appEnv } from '@/lib/env';
import { User } from 'generated/prisma';
import axios from 'axios';
import { UserService } from '@/modules/user/user.service';
import { StrategyFailure } from 'passport';

@Injectable()
export class OAuthStrategy extends PassportStrategy(Strategy, 'OAuth2') {
  constructor(private userService: UserService) {
    super({
      authorizationURL: appEnv.authServiceBackUrl + '/oauth2/authorize',
      callbackURL: `${appEnv.baseUrl}/auth/callback`,
      pkce: true,
      state: 'xyz123',
      tokenURL: appEnv.authServiceBackUrl + '/oauth2/token',
      clientID: appEnv.appId,
      clientSecret: appEnv.appKey,
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: User) {
    const user = await this.userService.findOrCreate(profile);
    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  fail(challenge?: StrategyFailure | string | number, status?: number): void {
    console.log('oauth failed:', challenge, status);
  }

  error(err: any): void {
    console.log('oauth error:', err);
  }

  userProfile(
    accessToken: string,
    done: (err?: unknown, profile?: User) => void,
  ) {
    axios
      .get<User>(appEnv.authServiceBackUrl + '/userinfo', {
        headers: {
          Authorization: 'Bearer ' + accessToken,
        },
      })
      .then((res) => {
        done(null, res.data);
      })
      .catch((e) => {
        console.log(e);
        done(e, undefined);
      });
  }
}
