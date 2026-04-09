<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Runtime callback validation helpers for the extracted recipe-manager collaborators.
 *
 * @since 0.2.0-lite
 */
class CM6GPT_Lite_Recipe_Callback_Guards {

	/**
	 * Validate a callback map and fail early when required entries are missing.
	 *
	 * @since 0.2.0-lite
	 *
	 * @param array<string, mixed> $callbacks Incoming callback map.
	 * @param array<int, string>   $required  Required callback keys.
	 * @param string               $owner     Owning class name for diagnostics.
	 * @return array<string, callable>
	 */
	public static function require_map( array $callbacks, array $required, string $owner ): array {
		$validated = [];

		foreach ( $callbacks as $key => $callback ) {
			if ( is_string( $key ) && is_callable( $callback ) ) {
				$validated[ $key ] = $callback;
			}
		}

		foreach ( $required as $name ) {
			if ( isset( $validated[ $name ] ) ) {
				continue;
			}

			throw new InvalidArgumentException(
				sprintf(
					'%s requires callable dependency "%s".',
					$owner,
					(string) $name
				)
			);
		}

		return $validated;
	}
}

if ( ! class_exists( 'RCAT_Callback_Guards', false ) ) {
	class_alias( 'CM6GPT_Lite_Recipe_Callback_Guards', 'RCAT_Callback_Guards' );
}
