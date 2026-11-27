import { Link } from '@tanstack/react-router';

import classes from './AppLogo.module.css';

/** ホームへのリンクを兼ねるロゴ。表記と書体はここに固定する。 */
export function AppLogo() {
  return (
    <Link to="/" className={classes.logo}>
      fuyugyō
    </Link>
  );
}
