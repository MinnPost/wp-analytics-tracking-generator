<?php
/**
 * Class file for the WP_Analytics_Tracking_Generator_Front_End class.
 *
 * @file
 */

if ( ! class_exists( 'WP_Analytics_Tracking_Generator' ) ) {
	die();
}

/**
 * Create default WordPress front end functionality
 */
class WP_Analytics_Tracking_Generator_Front_End {

	protected $option_prefix;
	protected $version;
	protected $slug;
	//protected $cache;

	/**
	* Constructor which sets up front end
	*
	* @param string $option_prefix
	* @param string $version
	* @param string $slug
	* @throws \Exception
	*/
	public function __construct( $option_prefix, $version, $slug ) {

		$this->option_prefix = $option_prefix;
		$this->version       = $version;
		$this->slug          = $slug;
		//$this->cache         = $cache;

		//$this->mp_mem_transients = $this->cache->mp_mem_transients;

		$this->add_actions();

	}

	/**
	* Create the action hooks
	*
	*/
	public function add_actions() {
		if ( ! is_admin() ) {
			add_action( 'wp_head', array( $this, 'output_tracking_code' ), 99 );
		}
	}

	/**
	* Output the tracking code on the page if allowed
	*
	*/
	public function output_tracking_code() {
		$show_analytics_code = $this->show_analytics_code();
		if ( true === $show_analytics_code ) {
			$type = get_option( $this->option_prefix . 'tracking_code_type', '' );
			if ( '' !== $type ) {
				$disable_pageview = get_option( $this->option_prefix . 'disable_pageview', false );
				$disable_pageview = filter_var( $disable_pageview, FILTER_VALIDATE_BOOLEAN );
				$property_id      = get_option( $this->option_prefix . 'property_id', '' );
				require_once( plugin_dir_path( __FILE__ ) . '/../templates/front-end/tracking-code-' . $type . '.php' );
			}
		}
	}

	/**
	* Whether or not to show the analytics code on the current page to the current user
	*
	* @return bool $show_analytics_code
	*
	*/
	private function show_analytics_code() {
		$show_analytics_code = true;
		$user_id             = get_current_user_id();
		if ( 0 === $user_id ) {
			return $show_analytics_code;
		} else {
			$user_data         = get_userdata( $user_id );
			$user_roles        = $user_data->roles;
			$disable_for_roles = get_option( $this->option_prefix . 'disable_for_roles', array() );
			$user_roles_block  = array_intersect( $user_roles, $disable_for_roles );
			if ( empty( $user_roles_block ) ) {
				return $show_analytics_code;
			} else {
				$show_analytics_code = false;
			}
		}
		return $show_analytics_code;
	}

}
