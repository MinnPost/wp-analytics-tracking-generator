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
			//add_shortcode( 'mp_staff', array( $this, 'mp_staff' ) );
		}
	}
}
