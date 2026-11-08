<?php
/**
 * Plugin Name:       Command Deck
 * Plugin URI:        https://github.com/memberfixstudio-ind/command-deck
 * Description:       Press ⌘K / Ctrl+K anywhere in wp-admin to jump to any screen, find any post, page or user, and run common actions. No settings to learn.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Rohan Salave
 * Author URI:        https://www.linkedin.com/in/rohan-salave-362475189/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       command-deck
 *
 * @package CommandDeck
 */

defined( 'ABSPATH' ) || exit;

define( 'COMMAND_DECK_VERSION', '1.0.0' );
define( 'COMMAND_DECK_URL', plugin_dir_url( __FILE__ ) );

/**
 * Load the palette on every admin screen for users who can edit content.
 */
function command_deck_enqueue() {
	if ( ! current_user_can( 'edit_posts' ) ) {
		return;
	}

	wp_enqueue_style( 'command-deck', COMMAND_DECK_URL . 'assets/command-deck.css', array(), COMMAND_DECK_VERSION );
	wp_enqueue_script( 'command-deck', COMMAND_DECK_URL . 'assets/command-deck.js', array( 'wp-api-fetch' ), COMMAND_DECK_VERSION, true );
}
add_action( 'admin_enqueue_scripts', 'command_deck_enqueue' );

/**
 * Turn a menu title such as "Comments <span class="count">3</span>" into "Comments".
 *
 * @param string $title Raw menu title.
 * @return string
 */
function command_deck_clean_title( $title ) {
	$title = preg_replace( '/<span[^>]*>.*?<\/span>/s', '', (string) $title );
	return trim( html_entity_decode( wp_strip_all_tags( $title ), ENT_QUOTES, 'UTF-8' ) );
}

/**
 * Build the admin URL for a menu or submenu slug, the same way WordPress does.
 *
 * @param string $slug   Menu slug.
 * @param string $parent Parent slug, empty for top-level items.
 * @return string
 */
function command_deck_menu_url( $slug, $parent = '' ) {
	if ( preg_match( '/^https?:\/\//', $slug ) ) {
		return $slug;
	}
	if ( false !== strpos( $slug, '.php' ) ) {
		return admin_url( $slug );
	}
	if ( $parent && false !== strpos( $parent, '.php' ) ) {
		return add_query_arg( 'page', $slug, admin_url( $parent ) );
	}
	return add_query_arg( 'page', $slug, admin_url( 'admin.php' ) );
}

/**
 * Collect every admin screen the current user can open.
 *
 * @return array[]
 */
function command_deck_screens() {
	global $menu, $submenu;

	$screens = array();
	if ( empty( $menu ) || ! is_array( $menu ) ) {
		return $screens;
	}

	foreach ( $menu as $item ) {
		if ( empty( $item[0] ) || empty( $item[2] ) || ( isset( $item[4] ) && false !== strpos( $item[4], 'wp-menu-separator' ) ) ) {
			continue;
		}
		if ( ! current_user_can( $item[1] ) ) {
			continue;
		}

		$parent_title = command_deck_clean_title( $item[0] );
		$parent_slug  = $item[2];
		$children     = isset( $submenu[ $parent_slug ] ) ? $submenu[ $parent_slug ] : array();

		if ( empty( $children ) ) {
			$screens[] = array(
				'title' => $parent_title,
				'group' => __( 'Screens', 'command-deck' ),
				'url'   => command_deck_menu_url( $parent_slug ),
			);
			continue;
		}

		foreach ( $children as $child ) {
			if ( empty( $child[0] ) || empty( $child[2] ) || ! current_user_can( $child[1] ) ) {
				continue;
			}
			$child_title = command_deck_clean_title( $child[0] );
			$screens[]   = array(
				'title' => $child_title === $parent_title ? $parent_title : $parent_title . ' › ' . $child_title,
				'group' => __( 'Screens', 'command-deck' ),
				'url'   => command_deck_menu_url( $child[2], $parent_slug ),
			);
		}
	}

	return $screens;
}

/**
 * Quick actions shown before the user types anything.
 *
 * @return array[]
 */
function command_deck_actions() {
	$actions = array(
		array(
			'title' => __( 'Write a new post', 'command-deck' ),
			'url'   => admin_url( 'post-new.php' ),
			'cap'   => 'edit_posts',
			'keys'  => 'add create',
		),
		array(
			'title' => __( 'Create a new page', 'command-deck' ),
			'url'   => admin_url( 'post-new.php?post_type=page' ),
			'cap'   => 'edit_pages',
			'keys'  => 'add',
		),
		array(
			'title' => __( 'Upload media', 'command-deck' ),
			'url'   => admin_url( 'media-new.php' ),
			'cap'   => 'upload_files',
			'keys'  => 'image file add',
		),
		array(
			'title' => __( 'Add a user', 'command-deck' ),
			'url'   => admin_url( 'user-new.php' ),
			'cap'   => 'create_users',
			'keys'  => 'invite member',
		),
		array(
			'title' => __( 'Install a plugin', 'command-deck' ),
			'url'   => admin_url( 'plugin-install.php' ),
			'cap'   => 'install_plugins',
			'keys'  => 'add',
		),
		array(
			'title'    => __( 'View the site', 'command-deck' ),
			'url'      => home_url( '/' ),
			'cap'      => 'read',
			'keys'     => 'home front visit',
			'external' => true,
		),
		array(
			'title' => __( 'Edit my profile', 'command-deck' ),
			'url'   => admin_url( 'profile.php' ),
			'cap'   => 'read',
			'keys'  => 'account password',
		),
	);

	$allowed = array();
	foreach ( $actions as $action ) {
		if ( current_user_can( $action['cap'] ) ) {
			unset( $action['cap'] );
			$action['group'] = __( 'Actions', 'command-deck' );
			$allowed[]       = $action;
		}
	}

	/**
	 * Filter the quick actions. Each action needs a title and url; group, keys and external are optional.
	 *
	 * @param array[] $allowed Actions the current user may run.
	 */
	return apply_filters( 'command_deck_actions', $allowed );
}

/**
 * Print the palette data late, after every plugin has registered its menus.
 */
function command_deck_print_data() {
	if ( ! current_user_can( 'edit_posts' ) || ! wp_script_is( 'command-deck', 'enqueued' ) ) {
		return;
	}

	$data = array(
		'actions'   => command_deck_actions(),
		'screens'   => command_deck_screens(),
		'adminUrl'  => admin_url(),
		'canUsers'  => current_user_can( 'list_users' ),
		'isMac'     => isset( $_SERVER['HTTP_USER_AGENT'] ) && false !== stripos( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 'Mac' ),
		'i18n'      => array(
			'placeholder' => __( 'Search screens, posts, pages and users…', 'command-deck' ),
			'empty'       => __( 'Nothing matches. Try a shorter word.', 'command-deck' ),
			'searching'   => __( 'Searching your content…', 'command-deck' ),
			'content'     => __( 'Content', 'command-deck' ),
			'users'       => __( 'Users', 'command-deck' ),
			'recent'      => __( 'Recent', 'command-deck' ),
			'open'        => __( 'Open', 'command-deck' ),
			'navigate'    => __( 'Move', 'command-deck' ),
			'close'       => __( 'Close', 'command-deck' ),
			'newTab'      => __( 'New tab', 'command-deck' ),
			'label'       => __( 'Command Deck', 'command-deck' ),
			'hint'        => __( 'Search', 'command-deck' ),
		),
	);

	printf(
		'<script id="command-deck-data">window.commandDeck = %s;</script>',
		wp_json_encode( $data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE )
	);
}
add_action( 'admin_footer', 'command_deck_print_data', 1 );

/**
 * Add a small search trigger to the admin bar so mouse users can find the palette too.
 *
 * @param WP_Admin_Bar $bar Admin bar instance.
 */
function command_deck_admin_bar( $bar ) {
	if ( ! is_admin() || ! current_user_can( 'edit_posts' ) ) {
		return;
	}
	$bar->add_node(
		array(
			'id'     => 'command-deck',
			'parent' => 'top-secondary',
			'title'  => '<span class="cd-bar-trigger"><span class="ab-icon dashicons dashicons-search" aria-hidden="true"></span><span class="cd-bar-label">' . esc_html__( 'Search', 'command-deck' ) . '</span><kbd class="cd-bar-kbd"></kbd></span>',
			'href'   => '#command-deck',
			'meta'   => array( 'title' => __( 'Open Command Deck', 'command-deck' ) ),
		)
	);
}
add_action( 'admin_bar_menu', 'command_deck_admin_bar', 5 );
